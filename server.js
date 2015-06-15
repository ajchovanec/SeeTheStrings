var Finalhandler = require('finalhandler');
var Http = require('http');
var Router = require('router');
var Url = require('url');
var ServeStatic = require('serve-static');
var DBWrapper = require('node-dbi').DBWrapper;
var PGTypes = require('pg').types
var CacheManager = require('cache-manager');
var SimpleBarrier = require('simple-barrier')
var _ = require('underscore');

var port = process.env.PORT || 3000;

// Ensure that node-pg parses all integer fields as integers, not strings.
PGTypes.setTypeParser(20 /* int8 */, function(value) {
  return value === null ? null : parseInt(value)
});

function getEnvVarOrDie(envVarName) {
  var envVar = process.env[envVarName];
  if (envVar == null) {
    console.log("Required environment variable " + envVarName + " is undefined! Aborting.");
    process.exit(1);
  }
  return envVar;
}

var postgresDbConfig = {
  host: getEnvVarOrDie("PG_HOST"),
  user: getEnvVarOrDie("PG_USER"),
  password: getEnvVarOrDie("PG_PASSWORD"),
  database: getEnvVarOrDie("PG_DATABASE")
};

var memoryCache = CacheManager.caching(
    {
      store: 'memory',
      max: 10,
      ttl: 604800 /* 1 week */,
    });

// TODO: Move this and other helper methods into a utilities module.
function getDbWrapper() {
  var cachingDbWrapper = {
    _dbWrapper: new DBWrapper("pg", postgresDbConfig),
    _isConnected: false,
    connect:
        function() {
          // This is actually a no-op. The real call to the underlying DBWrapper.connect() is done
          // on demand -- i.e., only if there is a cache miss.
        },
    close:
        function(errCallback) {
          if (this._isConnected) {
            this._dbWrapper.close(
                function(err) {
                  if (err) {
                    console.log("Error closing connection: " + JSON.stringify(err));
                  } else {
                    console.log("Connection closed!");
                    isConnected = false;
                  }
                });
          }
        },
    fetchAll:
        function(sqlQuery, callback) {
          var self = this;
          memoryCache.wrap(
              sqlQuery,
              function (cacheCallback) {
                console.log("Cache miss, querying the SQL database");
                function doFetchAll() {
                  self._dbWrapper.fetchAll(sqlQuery, null, cacheCallback);
                }
                if (!self._isConnected) {
                  // TODO: There may still be a race condition here.
                  self._isConnected = true;
                  self._dbWrapper.connect(doFetchAll);
                } else {
                  doFetchAll();
                }
              },
              604800 /* 1 week */,
              callback);
        }
  };
  return cachingDbWrapper;
}

// TODO: Move this and other helper methods into a utilities module.
function ensureQuoted(str) {
  var regex = /^['"]?([^'"]*)['"]?$/;
  var result = str.match(regex);
  if (result == null) {
    console.log("Warning: input string contains quotation marks: " + str);
    return null;
  } 
  if (result.length != 2) {
    console.log("Warning: unexpected result from attempted string match: " + str + " -> " + result);
  } else {
    return "'" + result[1] + "'";
  }
}

// TODO: Move this and other helper methods into a utilities module.
function ClientError(message) {
  this.message = message;
}

// TODO: Ensure that the cycle query param is always sent, so that we will no longer need to
// choose a default value here.
var defaultCycle = 2014;

function queryContributions(req, res) {
  var url = req.url;
  var queryParams = Url.parse(url, true).query;

  var rawSeedRace = queryParams["race"];
  var rawSeedCandidates = queryParams["candidates"];
  var rawSeedPacs = queryParams["pacs"];
  var rawSeedIndivs = queryParams["indivs"];
  var rawContributionTypes = queryParams["contributionTypes"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];

  var cycle = queryParams["cycle"] || defaultCycle;
  var seedRace = null;
  var seedCandidates = [];
  var seedPacs = [];
  var seedIndivs = [];
  var contributionTypes = [];
  if (rawSeedRace) {
    seedRace = ensureQuoted(rawSeedRace);
  }
  if (rawSeedCandidates) {
    if (!(rawSeedCandidates instanceof Array)) {
      rawSeedCandidates = [ rawSeedCandidates ];
    }
    seedCandidates = _.map(rawSeedCandidates, ensureQuoted);
  }
  if (rawSeedPacs) {
    if (!(rawSeedPacs instanceof Array)) {
      rawSeedPacs = [ rawSeedPacs ];
    }
    seedPacs = _.map(rawSeedPacs, ensureQuoted);
  }
  if (rawSeedIndivs) {
    if (!(rawSeedIndivs instanceof Array)) {
      rawSeedIndivs = [ rawSeedIndivs ];
    }
    seedIndivs = _.map(rawSeedIndivs, ensureQuoted);
  }
  if (rawContributionTypes) {
    if (!(rawContributionTypes instanceof Array)) {
      rawContributionTypes = [ rawContributionTypes ];
    }
    contributionTypes = _.map(rawContributionTypes, ensureQuoted);
  }

  doQueryContributions(cycle, seedIndivs, seedPacs, seedRace, seedCandidates,
      groupCandidatesBy, groupContributionsBy, contributionTypes, res);
}

function getPacAttributesToSelect(groupContributionsBy, relativeType) {
  switch (groupContributionsBy) {
    case "PAC":
      // For now we use the pacshort field as a unique identifier, even though that's ostensibly
      // what the cmteid field is for. The cmteid field doesn't work well in practice, because there
      // are many duplicate rows with the same pacshort but different cmteid values. Using cmteid as
      // a unique identifier causes these PACs to be displayed as distinct entities with the same
      // name, which is confusing and misleading.
      //
      // TODO: Per the OpenData User's Guide, if the grouping unit (candidate, state, race, etc) has
      // more than one distinct orgname for any given ultorg, you list the ultorg with the total of
      // the orgnames. If an ultorg has but a single orgname for a given group, you list the
      // orgname.
      return {
        outer: "pacshort as " + relativeType + "name, pacshort as " + relativeType + "id, ",
        inner: "pacshort, "
      };
      break;
    case "Industry":
      return {
        outer: "catname as " + relativeType + "name, catcode as " + relativeType + "id, "
            + "true as " + relativeType + "aggregate, ",
        inner: "catname, catcode, "
      };
      break;
    case "Sector":
      return {
        outer: "sector as " + relativeType + "name, sector as " + relativeType + "id, "
            + "true as " + relativeType + "aggregate, ",
        inner: "sector, "
      };
      break;
    default:
      throw new ClientError("Invalid groupContributionsBy value " + groupContributionsBy);
  }
}

function getPacContributionsQuery(cycle, seedPacs, seedRace, seedCandidates,
    groupCandidatesBy, groupContributionsBy, contributionTypes) {
  var pacAttributesToSelect = getPacAttributesToSelect(groupContributionsBy, "source");
  var outerSelectSources = pacAttributesToSelect.outer;
  var innerSelectSources = pacAttributesToSelect.inner;
  // TODO: Verify that groupCandidatesBy is actually set.
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as targetname, -1 as targetid, true as targetaggregate, "
      : "firstlastp as targetname, cid as targetid, party, ";
  var outerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "targetname, targetid, party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var outerAttributes = "'pac' as sourcetype, 'candidate' as targettype, ";
  var innerAttributes = "";
  var seedTargetAttributes = [];
  var seedMatchingCriteria = [];
  var outerOrderBy = "";
  if (seedPacs.length > 0) {
    var lowerPacshortQuery =
        "select lower(pacshort) from Committees where Committees.cmteid in (" + seedPacs + ")";
    innerAttributes += "(lower(Committees.pacshort) in (" + lowerPacshortQuery + ")) as seedpac, ";
    outerAttributes += "bool_or(seedpac) as seedsource, ";
    seedMatchingCriteria.push("seedpac ");
    outerOrderBy += "seedsource desc, ";
  }
  if (seedRace != null) {
    var raceQuery = "select cid from Candidates where distidrunfor = " + seedRace
        + " and currcand = 'Y'";
    innerAttributes += "(PACsToCandidates.cid in (" + raceQuery + ")) as seedrace, ";
    seedTargetAttributes.push("bool_or(seedrace) ");
    seedMatchingCriteria.push("seedrace ");
  }
  if (seedCandidates.length > 0) {
    innerAttributes += "(Candidates.cid in (" + seedCandidates + ")) as seedcandidate, ";
    seedTargetAttributes.push("bool_or(seedcandidate) ");
    seedMatchingCriteria.push("seedcandidate ");
  }
  if (seedTargetAttributes.length > 0) {
    outerAttributes += "(" + seedTargetAttributes.join("or ") + ") as seedtarget, ";
    outerOrderBy += "seedtarget desc, ";
  }
  if (seedMatchingCriteria.length == 0) {
    throw new ClientError("No seed IDs were specified");
  }
  seedMatchingCriteria = seedMatchingCriteria.join("or ");

  var sqlQuery =
      "select " + outerSelectSources + outerSelectTargets + outerAttributes
          + "directorindirect, isagainst, sum(amount) as amount from "
          + "(select distinct PACsToCandidates.cycle as cycle, fecrecno, "
              + innerSelectSources + innerSelectTargets + innerAttributes
              + "directorindirect, type in ('24A', '24N') as isagainst, "
              + "amount from PACsToCandidates "
              + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                  + "and PACsToCandidates.cycle = Candidates.cycle "
              + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                  + "and PACsToCandidates.cycle = Committees.cycle "
              + "inner join Categories on Categories.catcode = Committees.primcode "
              // TODO: We may also need to verify that Candidates.currcand = 'Y' here.
              + "where directorindirect in (" + contributionTypes + ")) as InnerQuery "
          + "where cycle = '" + cycle + "' and (" + seedMatchingCriteria + ") "
          + "group by sourcename, sourceid, " + outerGroupByTargets
              + "directorindirect, isagainst "
          + "having sum(amount) > 0 "
          + "order by " + outerOrderBy + "amount desc ";
  return sqlQuery;
}

function getInnerIndivToCandidateContributionsQuery(cycle, seedIndivs, seedRace, seedCandidates,
    groupCandidatesBy) {
  var maxLinksPerSeed = 100;

  function getOneSeedSubquery(cycle, seedType, seedIndivs, seedRace, seedCandidates) {
    var seedIndivSelectTarget = "";
    var seedRaceSelectTarget = "";
    var seedCandidateSelectTarget = "";

    var seedMatchingCriteria;
    var orderBySeed;
    if (seedType == "Individual") {
      seedIndivSelectTarget = "true as seedindiv, ";
      seedMatchingCriteria = "contribid = " + seedIndivs[0];
      orderBySeed = "seedindiv, ";
    } else if (seedType == "Race") {
      seedRaceSelectTarget = "true as seedrace, "
      seedMatchingCriteria = "recipid in (select cid from Candidates where distidrunfor = "
          + seedRace + " and currcand = 'Y')";
      orderBySeed = "seedrace, ";
    } else if (seedType == "Candidate") {
      seedCandidateSelectTarget = "true as seedcandidate, ";
      seedMatchingCriteria = "recipid = " + seedCandidates[0];
      orderBySeed = "seedcandidate, ";
    }

    if (seedIndivSelectTarget == "" && seedIndivs.length > 0) {
      seedIndivSelectTarget = "contribid in (" + seedIndivs + ") as seedindiv, ";
    }
    if (seedRaceSelectTarget == "" && seedRace) {
      seedRaceSelectTarget = "(recipid in (select cid from Candidates where distidrunfor = "
          + seedRace + " and currcand = 'Y')) as seedrace, "
    }
    if (seedCandidateSelectTarget == "" && seedCandidates.length > 0) {
      seedCandidateSelectTarget = "recipid in (" + seedCandidates + ") as seedcandidate, ";
    }

    // TODO: The use of maxLinksPerSeed is broken for the case where seedType == 'Race'. It causes
    // us to select that many contributors for all candidates combined, rather than per candidate.
    var seedSqlQuery = "(select contrib, contribid, recipid, " + seedIndivSelectTarget
        + seedRaceSelectTarget + seedCandidateSelectTarget + " amount from IndivsToCandidateTotals "
        + "where " + seedMatchingCriteria + " and cycle = '" + cycle + "' order by " + orderBySeed
        + "amount desc limit " + maxLinksPerSeed + ") ";
    return seedSqlQuery;
  }
  var subqueries = [];
  seedIndivs.forEach(function(indiv) {
    subqueries.push(getOneSeedSubquery(cycle, "Individual", [ indiv ], seedRace, seedCandidates));
  });
  if (seedRace != null) {
    subqueries.push(getOneSeedSubquery(cycle, "Race", seedIndivs, seedRace, seedCandidates));
  }
  seedCandidates.forEach(function(candidate) {
    subqueries.push(getOneSeedSubquery(cycle, "Candidate", seedIndivs, seedRace, [ candidate ]));
  });
  console.log("Proposed subqueries: " + subqueries);
  var alternateInnerSqlQuery = subqueries.join("union ");

  var innerSelectSources = (groupCandidatesBy == "Selection")
      ? "mode() within group (order by contrib) as contrib, contribid, "
      : "contrib, contribid, ";
  // TODO: Reimplement support for mode groupCandidatesBy=Selection.
  //
  // TODO: Verify that groupCandidatesBy is actually set.
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? "" : "recipid, ";
  var innerAttributes = "";
  var seedMatchingCriteria = [];
  var filterCriteria = {
    contribidFilter: "contribid is not null and trim(contribid) != '' ",
    recipidFilter: "recipid like 'N%' "
  };
  if (seedIndivs.length > 0) {
    var criterion = "contribid in (" + seedIndivs + ") ";
    innerAttributes += "(" + criterion + ") as seedindiv, ";
    seedMatchingCriteria.push(criterion);
  }
  var seedAggregator = (groupCandidatesBy == "Selection") ? "bool_or" : "";
  if (seedRace != null) {
    var raceQuery = "select cid from Candidates where distidrunfor = " + seedRace
        + " and currcand = 'Y'";
    var criterion = "recipid in (" + raceQuery + ") ";
    innerAttributes += seedAggregator + "(" + criterion + ") as seedrace, ";
    seedMatchingCriteria.push(criterion);
  }
  if (seedCandidates.length > 0) {
    var criterion = "recipid in (" + seedCandidates + ") ";
    innerAttributes += seedAggregator + "(" + criterion + ") as seedcandidate, ";
    seedMatchingCriteria.push(criterion);
  }
  innerAttributes += (groupCandidatesBy == "Selection") ? "sum(amount) as amount " : "amount ";
  seedMatchingCriteria = seedMatchingCriteria.length > 0
      ? "(" + seedMatchingCriteria.join("or ") + ") and "
      : "";
  filterCriteria = Object.keys(filterCriteria).length > 0
      ? "(" + _.values(filterCriteria).join("and ") + ") and "
      : "";
  var groupByClause = (groupCandidatesBy == "Selection")
      ? "group by contribid"
      : "";

  var innerSqlQuery = "select distinct " + innerSelectSources + innerSelectTargets + innerAttributes
      + "from IndivsToCandidateTotals "
      + "where " + seedMatchingCriteria + filterCriteria + "cycle = '" + cycle + "' "
      + groupByClause
  return innerSqlQuery;
}

// TODO: In the interest of conciseness, remove degrees of freedom from this method, and factor
// functionality that's shared with getPacContributions() out into a separate method.
function getIndivToCandidateContributionsQuery(cycle, seedIndivs, seedRace, seedCandidates,
    groupCandidatesBy) {
  var outerSelectSources = "contrib as sourcename, contribid as sourceid, ";
  // TODO: Reimplement support for mode groupCandidatesBy=Selection.
  //
  // TODO: Verify that groupCandidatesBy is actually set.
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as targetname, -1 as targetid, true as targetaggregate, "
      : "firstlastp as targetname, recipid as targetid, party, ";
  var outerAttributes = "'indiv' as sourcetype, 'candidate' as targettype, ";
  var joinClause = (groupCandidatesBy == "Selection") ? ""
      : "inner join Candidates on InnerQuery.recipid = Candidates.cid ";
  var whereClause = "where amount > 0 ";
  whereClause += (groupCandidatesBy == "Selection") ? ""
      : "and cycle = '" + cycle + "' and currcand = 'Y' ";
  var seedTargetAttributes = [];
  var outerOrderBy = "";
  if (seedIndivs.length > 0) {
    outerAttributes += "seedindiv as seedsource, ";
    outerOrderBy += "seedsource desc, ";
  }
  var seedAggregator = (groupCandidatesBy == "Selection") ? "bool_or" : "";
  if (seedRace != null) {
    var raceQuery = "select cid from Candidates where distidrunfor = " + seedRace
        + " and currcand = 'Y'";
    seedTargetAttributes.push("seedrace ");
  }
  if (seedCandidates.length > 0) {
    seedTargetAttributes.push("seedcandidate ");
  }
  if (seedTargetAttributes.length > 0) {
    outerAttributes += "(" + seedTargetAttributes.join("or ") + ") as seedtarget, ";
    outerOrderBy += "seedtarget desc, ";
  }

  var innerSqlQuery = getInnerIndivToCandidateContributionsQuery(cycle, seedIndivs, seedRace,
      seedCandidates, groupCandidatesBy)

  // TODO: Find a way to reliably normalize this data, possibly by extracting the contrib field out
  // into a separate table.
  var outerSqlQuery =
      "select " + outerSelectSources + outerSelectTargets + outerAttributes
          + "'D' as directorindirect, false as isagainst, amount from "
          + "(" + innerSqlQuery + ") as InnerQuery "
          // TODO: Also join against Categories to support grouping individuals by realcode.
          + joinClause + whereClause
          + "order by " + outerOrderBy + "amount desc ";
  return outerSqlQuery;
}

function doQueryContributions(cycle, seedIndivs, seedPacs, seedRace, seedCandidates,
    groupCandidatesBy, groupContributionsBy, contributionTypes, res) {
  var sqlQueries = [];
  try {
    var pacContributionsQuery = getPacContributionsQuery(cycle, seedPacs, seedRace, seedCandidates,
        groupCandidatesBy, groupContributionsBy, contributionTypes);
    sqlQueries.push(pacContributionsQuery)
    if (seedIndivs.length > 0) {
      var indivToCandidateContributionsQuery = getIndivToCandidateContributionsQuery(
          cycle, seedIndivs, seedRace, seedCandidates, groupCandidatesBy);
      sqlQueries.push(indivToCandidateContributionsQuery);
    }
  } catch (e) {
    // TODO: Is this the right way to fast fail a request?
    console.log("Error: " + e.message);
    res.writeHead(400);
    res.end();
    return;
  }

  function handleQueryResult(err, contributions) {
    if (err != null) {
      console.log("queryContributions error: " + JSON.stringify(err));
      return null;
    }
    return contributions;
  }
  var barrier = SimpleBarrier();
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  // TODO: Postgres breaks with "ERROR: connect: Error: write EPIPE" when we try to do two queries
  // on the same connection at the same time. Find out why. It may be necessary to perform the
  // queries serially.
  sqlQueries.forEach(function(sqlQuery) {
    console.log("SQL query: " + sqlQuery);
    dbWrapper.fetchAll(sqlQuery, barrier.waitOn(handleQueryResult));
  });
  barrier.endWith(function(contributionsLists) {
    var nonNullContributionsLists =
        contributionsLists.filter(function(list) { return list != null });
    var nullCount = contributionsLists.length - nonNullContributionsLists.length;
    if (nullCount == contributionsLists.length) {
      console.log("All " + contributionsLists.length + " queries failed!");
      // TODO: 500 might not be appropriate if the error is due to a malformed query.
      res.writeHead(500);
      res.end();
      dbWrapper.close();
      return;
    } else if (nullCount > 0) {
      console.log("Out of " + contributionsLists.length + " queries, " + nullCount + " failed. "
          + "Results of successful queries will be returned.");
    } else {
      console.log("Got all query results");
    }
    var allContributions = _.flatten(nonNullContributionsLists, true /* shallow */);
    console.log("JSON stringifying results");
    var stringified = JSON.stringify(allContributions);
    console.log("Writing results");
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(stringified, function() {
      console.log("Done writing results");
      dbWrapper.close();
    });
  });
}

function queryRaces(req, res) {
  var sqlQuery = "select distinct cycle, distidrunfor as raceid from Candidates "
      + "where currcand = 'Y' order by raceid asc ";
  console.log("SQL query for list of races: " + sqlQuery);
  var races = [];
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, result) {
        if (err != null) {
          console.log("queryRaces error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          dbWrapper.close();
          return;
        }
        console.log("Got a list of " + result.length + " races");
        result.forEach(function(row) {
          if (row.raceid.length != 4) {
            console.log("queryRaces warning: raceid has incorrect length " + row.raceid.length
                + " and is being ignored. Should be 4.");
            return;
          }
          if (row.raceid == "PRES") {
            row.stateid = "US";
            row.racename = "President";
            races.push(row);
          } else {
            row.stateid = row.raceid.substr(0, 2);
            var suffix = row.raceid.substr(2, 2);
            if (suffix[0] == "S") {
              row.racename = "Senate";
              // We want to list all Senate races before any of the House races.
              //
              // TODO: Arguably this should be done on the client since it's presentation logic.
              races.splice(0, 0, row);
            } else {
              var houseDistNumber = parseInt(suffix);
              if (isNaN(houseDistNumber)) {
                console.log("queryRaces warning: raceid " + row.raceid
                    + " could not be parsed and is being ignored.");
                return;
              }
              row.racename = "District " + houseDistNumber;
              races.push(row);
            } 
          }
        });
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(races), function() {
          dbWrapper.close();
        });
      });
}

function queryCandidates(req, res) {
  var sqlQuery = "select distinct cycle, lower(firstlastp) as sortkey, cid, firstlastp "
      + "from Candidates where cyclecand = 'Y' order by cycle asc, sortkey asc ";
  console.log("SQL query for list of candidates: " + sqlQuery);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, candidates) {
        if (err != null) {
          console.log("queryCandidates error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          dbWrapper.close();
          return;
        }
        console.log("Got a list of " + candidates.length + " candidates");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(candidates), function() {
          dbWrapper.close();
        });
      });
}

function queryPacs(req, res) {
  var sqlQuery = "select distinct on (cycle, lower(pacshort)) "
      + "cycle, lower(pacshort) as sortkey, cmteid, pacshort "
      + "from Committees where pacshort != '' order by cycle asc, sortkey asc";
  console.log("SQL query for list of PACs: " + sqlQuery);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, pacs) {
        if (err != null) {
          console.log("queryPacs error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          dbWrapper.close();
          return;
        }
        console.log("Got a list of " + pacs.length + " PACs");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(pacs), function() {
          dbWrapper.close();
        });
      });
}

var router = Router()
router.get('/contributions', queryContributions);
router.get('/races', queryRaces);
router.get('/candidates', queryCandidates);
router.get('/pacs', queryPacs);
// TODO: Remove files from web-content that we don't need to serve directly to users.
// Also, Make sure we return the right Content-Type for each file.
router.use('/', ServeStatic('web-content', {'index': ['form.html']}));

function onRequestError(err) {
  console.error("Error while handling HTTP request: " + err.toString());
}
var server = Http.createServer(
    function(req, res) {
      router(req, res, Finalhandler(req, res, { onerror: onRequestError }));
    });
// TODO: This seems to cause the request to retry, which may not be what we we want.
server.setTimeout(process.env.REQUEST_TIMEOUT || 120000 /* 2 min */);
server.listen(port,
    function() {
      console.log('Listening on http://localhost:' + port);
    });
