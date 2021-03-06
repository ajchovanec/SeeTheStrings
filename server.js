var Finalhandler = require('finalhandler');
var Http = require('http');
var Router = require('router');
var Url = require('url');
var ServeStatic = require('serve-static');
var DBWrapper = require('node-dbi').DBWrapper;
var PGTypes = require('pg').types
var CacheManager = require('cache-manager');
var SimpleBarrier = require('simple-barrier');
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
      ttl: 600 /* 10 minutes */,
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
              600 /* 10 minutes */,
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
var defaultCycle = "2014";

function queryContributions(req, res) {
  var url = req.url;
  var queryParams = Url.parse(url, true).query;

  var rawCycle = queryParams["cycle"];
  var rawSeedRace = queryParams["race"];
  var rawSeedCandidates = queryParams["candidates"];
  var rawSeedPacs = queryParams["pacs"];
  var rawSeedIndivs = queryParams["indivs"];
  var rawContributionTypes = queryParams["contributionTypes"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];

  var cycle = ensureQuoted(rawCycle || defaultCycle);
  var seedRace = rawSeedRace ? ensureQuoted(rawSeedRace) : null;
  var seedCandidates = [];
  var seedPacs = [];
  var seedIndivs = [];
  var contributionTypes = [];
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

  if (seedRace) {
    prefetchCandidatesForRace(cycle, seedRace, seedCandidates,
        function(err, allCandidates) {
          doQueryContributions(cycle, seedIndivs, seedPacs, allCandidates,
              groupCandidatesBy, groupContributionsBy, contributionTypes, res);
        });
  } else {
    doQueryContributions(cycle, seedIndivs, seedPacs, seedCandidates,
        groupCandidatesBy, groupContributionsBy, contributionTypes, res);
  }
}

function doQueryContributions(cycle, seedIndivs, seedPacs, seedCandidates,
    groupCandidatesBy, groupContributionsBy, contributionTypes, res) {
  var sqlQueries = [];
  try {
    var pacContributionsQuery = getPacContributionsQuery(cycle, seedPacs, seedCandidates,
        groupCandidatesBy, groupContributionsBy, contributionTypes);
    sqlQueries.push(pacContributionsQuery)
    if (seedIndivs.length > 0) {
      var indivToCandidateContributionsQuery = getIndivToCandidateContributionsQuery(
          cycle, seedIndivs, seedCandidates, groupCandidatesBy);
      sqlQueries.push(indivToCandidateContributionsQuery);
    }
  } catch (e) {
    // TODO: Is this the right way to fast fail a request?
    console.log("Error: " + e.message);
    res.writeHead(400);
    res.end();
    return;
  }

  doSqlQueries(sqlQueries, res);
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
        outer: "catname as " + relativeType + "name, catcode as " + relativeType + "id, ",
        inner: "catname, catcode, "
      };
      break;
    case "Sector":
      return {
        outer: "sector as " + relativeType + "name, sector as " + relativeType + "id, ",
        inner: "sector, "
      };
      break;
    default:
      throw new ClientError("Invalid groupContributionsBy value " + groupContributionsBy);
  }
}

function getPacContributionsQuery(cycle, seedPacs, seedCandidates,
    groupCandidatesBy, groupContributionsBy, contributionTypes) {
  var pacAttributesToSelect = getPacAttributesToSelect(groupContributionsBy, "source");
  var outerSelectSources = pacAttributesToSelect.outer;
  var innerSelectSources = pacAttributesToSelect.inner;
  // TODO: Verify that groupCandidatesBy is actually set.
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Selected candidates' as targetname, 'seedcandidates' as targetid, "
          + "true as targetaggregate, "
      : "firstlastp as targetname, cid as targetid, party as targetparty, ";
  var outerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "targetname, targetid, targetparty, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? "Candidates.cid, "
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var outerAttributes = "'pac' as sourcetype, 'candidate' as targettype, 1 as sourcecount, ";
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
          + "where cycle = " + cycle + " and (" + seedMatchingCriteria + ") "
          + "group by sourcename, sourceid, " + outerGroupByTargets
              + "directorindirect, isagainst "
          + "having sum(amount) > 0 "
          + "order by " + outerOrderBy + "amount desc ";
  return sqlQuery;
}

function getTopIndivContributionsQuery(cycle, seedIndivs, seedPacs, seedCandidates,
    groupCandidatesBy) {
  var maxLinksPerSeed = 100;

  function getOneSeedSubquery(cycle, seedType, seedIndivs, seedRecips, table) {
    var seedIndivSelectTarget = "";
    var seedRecipSelectTarget = "";

    var seedMatchingCriteria;
    var orderBySeed;
    if (seedType == "Individual") {
      seedIndivSelectTarget = "true as seedsource, ";
      seedMatchingCriteria = "contribid = " + seedIndivs[0];
      orderBySeed = "seedsource, ";
    } else if (seedType == "PAC" || seedType == "Candidate") {
      seedRecipSelectTarget = "true as seedtarget, ";
      seedMatchingCriteria = "recipid = " + seedRecips[0];
      orderBySeed = "seedtarget, ";
    }
  
    if (seedIndivSelectTarget == "") {
      seedIndivSelectTarget = (seedIndivs.length > 0)
          ? "contribid in (" + seedIndivs + ") as seedsource, "
          : "false as seedsource, ";
    }
    if (seedRecipSelectTarget == "") {
      seedRecipSelectTarget = (seedRecips.length > 0)
          ? "recipid in (" + seedRecips + ") as seedtarget, "
          : "false as seedtarget, ";
    }

    // TODO: This query may return contributions to inactive PACs and candidates, which may then be
    // filtered out when we join against the Committees or Candidates table. The way to prevent this
    // is to do the joining and filtering here.
    var seedSqlQuery =
        "(select contrib as sourcename, contribid as sourceid, false as sourceaggregate, "
            + "recipid as targetid, false as targetaggregate, "
            + seedIndivSelectTarget + seedRecipSelectTarget
            + "amount from " + table + " "
            + "where " + seedMatchingCriteria + " and cycle = " + cycle + " and amount > 0 "
            + "order by " + orderBySeed + "amount desc "
            + "limit " + maxLinksPerSeed + ") ";
    return seedSqlQuery;
  }
  var subqueries = [];
  seedIndivs.forEach(function(indiv) {
    subqueries.push(getOneSeedSubquery(cycle, "Individual", [ indiv ], seedCandidates,
        "IndivsToCandidateTotals"));
  });
  // TODO: Loop over seedPacs and add a subquery for each of those too. We can't do this until we
  // have a table with individual to PAC contributions.
  seedCandidates.forEach(function(candidate) {
    subqueries.push(getOneSeedSubquery(cycle, "Candidate", seedIndivs, [ candidate ],
        "IndivsToCandidateTotals"));
  });
  console.log("Proposed subqueries: " + subqueries);

  var innerSqlQuery = subqueries.join("union ");
  return innerSqlQuery;
}

// TODO: In the interest of conciseness, remove degrees of freedom from this method, and factor
// functionality that's shared with getPacContributions() out into a separate method.
function getIndivToCandidateContributionsQuery(cycle, seedIndivs, seedCandidates,
    groupCandidatesBy) {
  // TODO: Verify that groupCandidatesBy is actually set.

  var outerSelectSources = (groupCandidatesBy == "Selection")
      ? "mode() within group (order by sourcename) as sourcename, "
      : "sourcename, "
  var groupByClause = (groupCandidatesBy == "Selection")
      ? "group by sourceid, targetname, targetid, targetparty, sourceaggregate, targetaggregate, "
          + "seedsource, seedtarget "
      : "";
  outerSelectSources += "sourceid, sourceaggregate, ";
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "(case when seedtarget then 'Selected candidates' else firstlastp end) as targetname, "
          + "(case when seedtarget then 'seedcandidates' else targetid end) as targetid, "
          // Under mode groupCandidatesBy=Selection we only set the targetparty field for non-seed
          // candidates, since it is likely that the candidates in the selection will not all have
          // the same party.
          + "(case when seedtarget then null else party end) as targetparty, "
          + "(targetaggregate or seedtarget) as targetaggregate, "
      : "firstlastp as targetname, targetid, party as targetparty, targetaggregate, ";
  var outerAttributes = "'indiv' as sourcetype, 'candidate' as targettype, seedsource, seedtarget, "
      + "(sourceaggregate or targetaggregate) as anyaggregate, ";
  outerAttributes += (groupCandidatesBy == "Selection")
      ? "sum(sourcecount) as sourcecount, sum(targetcount) as targetcount, sum(amount) as amount, "
      : "sourcecount, targetcount, amount, ";
  var whereClause = "where amount > 0 ";
  whereClause += "and (Candidates.cycle = " + cycle + " and Candidates.currcand = 'Y') or "
      + "(Candidates.cycle is null and targetaggregate = true) ";
  // TODO: Maybe these don't need to be variables.
  var joinClause = "left outer join Candidates on UnionQuery.targetid = Candidates.cid ";
  var outerOrderBy = "seedsource desc, seedtarget desc, ";

  var topResultsQuery = getTopIndivContributionsQuery(cycle, seedIndivs, [], seedCandidates,
      groupCandidatesBy);

  var unionCandidateRemainderClause = "";
  if (seedCandidates.length > 0) {
    unionCandidateRemainderClause = "union ("
        + "select null as sourcename, "
            + "concat('indivs_to_', targetid) as sourceid, true as sourceaggregate, "
            + "targetid, false as targetaggregate, "
            + "seedsource, seedtarget, "
            + "cast(sourcecount as integer) as sourcecount, "
            + "cast(targetcount as integer) as targetcount, "
            + "cast(amount as integer) as amount from ("
            + "select targetid, false as seedsource, true as seedtarget, "
                // TODO: Under mode groupCandidatesBy=Selection, these summed individual and
                // candidate counts may be incorrect, since some individuals may have
                // contributed to more than one of the selected candidates.
                + "sum(sourcecount) as sourcecount, 1 as targetcount, "
                + "sum(amount) as amount from ("
                + "(select targetid, -count(distinct sourceid) as sourcecount, "
                    + "-sum(amount) as amount from TopResultsQuery "
                    + "where seedtarget group by targetid) "
                + "union (select recipid as targetid, count(distinct contribid) as sourcecount, "
                    + "sum(amount) as amount from IndivsToCandidateTotals "
                    + "where recipid in (" + seedCandidates + ") "
                        + "and cycle = " + cycle + " and amount > 0 "
                    + "group by targetid) "
                + ") as RowsToSum group by targetid "
            + ") as SummedRows "
        + ") ";
  }

  var unionIndividualRemainderClause = "";
  if (seedIndivs.length > 0) {
    // TODO: Uncomment the code below and fully populate unionIndividualRemainderClause.
    unionIndividualRemainderClause = "union ("
        + "select null as sourcename, "
            + "sourceid, false as sourceaggregate, "
            + "concat(sourceid, '_to_candidates') as targetid, true as targetaggregate, "
            + "seedsource, seedtarget, "
            + "cast(sourcecount as integer) as sourcecount, "
            + "cast(targetcount as integer) as targetcount, "
            + "cast(amount as integer) as amount from ("
            + "select sourceid, true as seedsource, false as seedtarget, "
                // TODO: Under mode groupCandidatesBy=Selection, these summed individual and
                // candidate counts may be incorrect, since some individuals may have
                // contributed to more than one of the selected candidates.
                + "1 as sourcecount, sum(targetcount) as targetcount, "
                + "sum(amount) as amount from ("
                + "(select sourceid, -count(distinct targetid) as targetcount, "
                    + "-sum(amount) as amount from TopResultsQuery "
                    + "where seedsource group by sourceid) "
                + "union (select contribid as sourceid, count(distinct recipid) as targetcount, "
                    + "sum(amount) as amount from IndivsToCandidateTotals "
                    + "where contribid in (" + seedIndivs + ") "
                        + "and cycle = " + cycle + " and amount > 0 "
                    + "group by sourceid) "
                + ") as RowsToSum group by sourceid "
            + ") as SummedRows where amount > 0 "
        + ") ";
  }

  // TODO: Find a way to reliably normalize this data, possibly by extracting the contrib field out
  // into a separate table.
  var outerSqlQuery = "with TopResultsQuery as (" + topResultsQuery + ") " 
      + "select " + outerSelectSources + outerSelectTargets + outerAttributes
          + "'D' as directorindirect, false as isagainst from ("
              + "(select sourcename, sourceid, sourceaggregate, targetid, targetaggregate, "
              + "seedsource, seedtarget, 1 as sourcecount, 1 as targetcount, amount "
              + "from TopResultsQuery) "
              // TODO: The candidate and individual remainder values may be too high, because they
              // may include contributions to inactive candidates that would have been filtered out
              // by the 'join' and 'where' clause below if they were not aggregated. To fix this,
              // join with the Candidates table in the remainder subqueries, and filter out inactive
              // candidates before aggregating.
              //
              // TODO: We may be able to infer if all candidates in the remainder are of the same
              // party, and if so, to color the remainder node appropriately. To do this, we'd need
              // to include a recipcode field in IndivsToCandidateTotals and count the number of
              // distinct values in the remainder.
              + unionCandidateRemainderClause
              + unionIndividualRemainderClause
          + ") as UnionQuery " 
          // TODO: Also join against Categories to support grouping individuals by realcode.
          + joinClause + whereClause + groupByClause
          + "order by anyaggregate asc, " + outerOrderBy + "amount desc ";
  return outerSqlQuery;
}

function prefetchCandidatesForRace(cycle, race, origCandidates, callback) {
  var sqlQuery = "select cid from Candidates where distidrunfor = " + race
      + " and cycle = " + cycle + " and currcand = 'Y'";
  console.log("Prefetching candidates for race " + race + ", cycle " + cycle);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, candidatesForRaceResults) {
        dbWrapper.close();
        var candidatesForRace = _.map(candidatesForRaceResults,
            function(result) {
              return ensureQuoted(result.cid);
            });
        console.log("Candidates successfully prefetched");
        var allCandidates = _.union(origCandidates, candidatesForRace);
        callback(err, allCandidates);
      });
}

function doSqlQueries(sqlQueries, res) {
  function handleOneQueryResult(err, results) {
    if (err != null) {
      console.log("Query error: " + JSON.stringify(err));
      return null;
    }
    return results;
  }
  var barrier = SimpleBarrier();
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  sqlQueries.forEach(
      function(sqlQuery) {
        console.log("SQL query: " + sqlQuery);
        dbWrapper.fetchAll(sqlQuery, barrier.waitOn(handleOneQueryResult));
      });
  barrier.endWith(
      function(resultLists) {
        dbWrapper.close();
        var nonNullResultLists =
            resultLists.filter(function(list) { return list != null });
        var nullCount = resultLists.length - nonNullResultLists.length;
        if (nullCount == resultLists.length) {
          console.log("All " + resultLists.length + " queries failed!");
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          return;
        } else if (nullCount > 0) {
          console.log("Out of " + resultLists.length + " queries, " + nullCount + " failed. "
              + "Results of successful queries will be returned.");
        } else {
          console.log("Got all query results");
        }
        var allResults = _.flatten(nonNullResultLists, true /* shallow */);
        console.log("JSON stringifying results");
        var allResultsString = JSON.stringify(allResults);
        console.log("Writing results");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(allResultsString,
            function() {
              console.log("Done writing results");
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
        dbWrapper.close();
        if (err != null) {
          console.log("queryRaces error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
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
        res.end(JSON.stringify(races));
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
        dbWrapper.close();
        if (err != null) {
          console.log("queryCandidates error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          return;
        }
        console.log("Got a list of " + candidates.length + " candidates");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(candidates));
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
        dbWrapper.close();
        if (err != null) {
          console.log("queryPacs error: " + JSON.stringify(err));
          // TODO: 500 might not be appropriate if the error is due to a malformed query.
          res.writeHead(500);
          res.end();
          return;
        }
        console.log("Got a list of " + pacs.length + " PACs");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(pacs));
      });
}

var router = Router()
router.get('/contributions', queryContributions);
router.get('/races', queryRaces);
router.get('/candidates', queryCandidates);
router.get('/pacs', queryPacs);
// TODO: Make sure we return the right Content-Type for each file.
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
