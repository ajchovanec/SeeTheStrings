var Finalhandler = require('finalhandler');
var Http = require('http');
var Router = require('router');
var Url = require('url');
var ServeStatic = require('serve-static');
var DBWrapper = require('node-dbi').DBWrapper;
var CacheManager = require('cache-manager');
var _ = require('underscore');

var port = process.env.PORT || 3000;

var dbType;
var dbConnectionConfig;
switch (process.env.DB_INSTANCE) {
  case "heroku":
    function getEnvVarOrDie(envVarName) {
      var envVar = process.env[envVarName];
      if (envVar == null) {
        console.log("Environment variable " + envVarName + " is required when DB_INSTANCE=heroku, "
            + "but is undefined! Aborting.");
        process.exit(1);
      }
      return envVar;
    }
    dbType = "pg";
    dbConnectionConfig = {
      host: getEnvVarOrDie("PG_HOST"),
      user: getEnvVarOrDie("PG_USER"),
      password: getEnvVarOrDie("PG_PASSWORD"),
      database: getEnvVarOrDie("PG_DATABASE")
    };
    break;
  default:
    console.log("DB_INSTANCE environment variable not set. Defaulting to 'local'.")
  case "local":
    dbType = "sqlite3";
    dbConnectionConfig = { path: "data/sqlite/CampaignFin14.db" };
};
console.log("Using database type " + dbType);

var memoryCache = CacheManager.caching({store: 'memory', max: 10, ttl: 604800 /* 1 week */});
function getDbWrapper() {
  var cachingDbWrapper = {
    dbWrapper: new DBWrapper(dbType, dbConnectionConfig),
    connect:
        function() {
          // This is actually a no-op. The real call to the underlying DBWrapper.connect() is done
          // on demand -- i.e., only if there is a cache miss.
        },
    close:
        function(errCallback) {
          if (this.dbWrapper.isConnected()) {
            this.dbWrapper.close(
                function(err) {
                  console.log(err ?
                      "Error closing connection: " + err
                    : "Connection closed!");
                  });
          }
        },
    fetchAll:
        function(sqlQuery, callback) {
          var self = this;
          memoryCache.wrap(
              sqlQuery,
              function (cacheCallback) {
                console.log("Cache miss, querying the SQL database")
                if (!self.dbWrapper.isConnected()) {
                  self.dbWrapper.connect();
                }
                self.dbWrapper.fetchAll(sqlQuery, null, cacheCallback);
              },
              604800 /* 1 week */,
              callback);
        }
  };
  return cachingDbWrapper;
}

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

function queryContributions(req, res) {
  var url = req.url;
  var queryParams = Url.parse(url, true).query;

  var rawSeedRace = queryParams["race"];
  var rawSeedCandidates = queryParams["candidates"];
  var rawSeedPacs = queryParams["pacs"];
  var rawContributionTypes = queryParams["contributionTypes"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];

  var seedRace = null;
  var seedCandidates = [];
  var seedPacs = [];
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
  if (rawContributionTypes) {
    if (!(rawContributionTypes instanceof Array)) {
      rawContributionTypes = [ rawContributionTypes ];
    }
    contributionTypes = _.map(rawContributionTypes, ensureQuoted);
  }

  var outerSelectSources;
  var innerSelectSources;
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
      // the orgnames. If an ultorg has but a single orgname for a given group, you list the orgname.
      outerSelectSources = "pacshort as sourcename, pacshort as sourceid, ";
      innerSelectSources = "pacshort, ";
      break;
    case "Industry":
      outerSelectSources = "catname as sourcename, catcode as sourceid, ";
      innerSelectSources = "catname, catcode, ";
      break;
    case "Sector":
      outerSelectSources = "sector as sourcename, sector as sourceid, ";
      innerSelectSources = "sector, ";
      break;
    default:
      // TODO: Is this the right way to fast fail the request?
      console.log("Error: Invalid groupContributionsBy value " + groupContributionsBy);
      res.writeHead(400);
      res.end();
      return;
  }
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as targetname, -1 as targetid, "
      : "firstlastp as targetname, cid as targetid, party, ";
  var outerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "targetname, targetid, party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var outerAttributes = "";
  var innerAttributes = "";
  var seedTargetAttributes = [];
  var seedMatchingCriteria = [];
  // SQLite doesn't have the bit_or() function that we need to do the disjunction across the values
  // of each of {seedrace, seedcandidate, seedpac}, so we have to use max() instead. But Postgres
  // won't let us treat boolean values as integers, so we have to cast to integers first. But then
  // we need to take another disjunction across the max values, and Postgres won't let us treat
  // integer values as booleans either, so we have to cast back; furthermore, we can't instead take
  // a max() of max values, because the functions to do this in Postgres and SQLite have different
  // names -- greatest() and max(), respectively. Sigh.
  if (seedPacs.length > 0) {
    innerAttributes += "(lower(Committees.pacshort) in (" + seedPacs + ") or "
        + "Committees.cmteid in (" + seedPacs + ")) as seedpac, ";  // for backwards compatibility
    outerAttributes += "cast(max(cast(seedpac as integer)) as boolean) as seedsource, ";
    seedMatchingCriteria.push("seedpac ");
  }
  if (seedRace != null) {
    innerAttributes += "(Candidates.distidrunfor = " + seedRace
        + " and Candidates.currCand = 'Y') as seedrace, ";
    seedTargetAttributes.push("cast(max(cast(seedrace as integer)) as boolean) ");
    seedMatchingCriteria.push("seedrace ");
  }
  if (seedCandidates.length > 0) {
    innerAttributes += "(Candidates.cid in (" + seedCandidates + ")) as seedcandidate, ";
    seedTargetAttributes.push("cast(max(cast(seedcandidate as integer)) as boolean) ");
    seedMatchingCriteria.push("seedcandidate ");
  }
  if (seedTargetAttributes.length > 0) {
    outerAttributes += "(" + seedTargetAttributes.join("or ") + ") as seedtarget, ";
  }
  if (seedMatchingCriteria.length == 0) {
    // TODO: Is this the right way to fast fail the request?
    console.log("Error: No seed IDs were specified.");
    res.writeHead(400);
    res.end();
    return;
  }
  seedMatchingCriteria = seedMatchingCriteria.join("or ");

  doQueryContributions(req, res, outerSelectSources, innerSelectSources,
      outerSelectTargets, innerSelectTargets, outerAttributes, innerAttributes,
      seedMatchingCriteria, contributionTypes, outerGroupByTargets, groupContributionsBy);
}

function doQueryContributions(req, res, outerSelectSources, innerSelectSources,
    outerSelectTargets, innerSelectTargets, outerAttributes, innerAttributes,
    seedMatchingCriteria, contributionTypes, outerGroupByTargets, groupContributionsBy) {
  var sqlQuery =
      "select " + outerSelectSources + outerSelectTargets + outerAttributes
          + "directorindirect, isagainst, sum(amount) as amount from "
          + "(select distinct fecrecno, " + innerSelectSources + innerSelectTargets
              + innerAttributes + "directorindirect, type in ('24A', '24N') as isagainst, "
              + "amount from PACsToCandidates "
              + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
              + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
              + "inner join Categories on Categories.catcode = Committees.primcode "
              + "where directorindirect in (" + contributionTypes + ")) as InnerQuery "
          + "where " + seedMatchingCriteria
          + "group by sourcename, sourceid, " + outerGroupByTargets
          + "directorindirect, isagainst "
          + "order by amount desc ";

  console.log("SQL query: " + sqlQuery);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, contributions) {
        if (err != null) {
          console.log("query error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(contributions));
        res.end();
        dbWrapper.close();
      });
}

function queryRaces(req, res) {
  var url = req.url;
  var queryParams = Url.parse(url, true).query;

  var sqlQuery = "select distinct substr(distidrunfor, 1, 2) as stateid, distidrunfor as raceid "
    + "from Candidates where currcand = 'Y' order by stateid asc, raceid asc ";
  console.log("SQL query for list of races: " + sqlQuery);
  var races = [];
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, result) {
        if (err != null) {
          console.log("queryRaces error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got a list of " + result.length + " races");
        result.forEach(function(row) {
          if (row.raceid.length != 4) {
            console.log("raceid has incorrect length " + row.raceid.length
                + " and is being ignored. Should be 4.");
            return;
          }
          var suffix = row.raceid.substr(2, 2);
          if (suffix[0] == "S") {
            row.racename = "Senate";
            // We want to list all Senate races before any of the House races.
            //
            // TODO: Arguably this should be done on the client side since it's presentation logic.
            races.splice(0, 0, row);
          } else {
            var houseDistNumber = parseInt(suffix);
            if (isNaN(houseDistNumber)) {
              console.log("raceid " + row.distid + " could not be parsed and is being ignored.");
              return;
            }
            row.racename = "District " + houseDistNumber;
            races.push(row);
          }
        });
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(races));
        res.end();
        dbWrapper.close();
      });
}

function queryCandidates(req, res) {
  var sqlQuery = "select distinct cid, firstlastp, lower(firstlastp) as sortkey "
      + "from Candidates where cycle = '2014' and cyclecand = 'Y' order by sortkey asc ";
  console.log("SQL query for list of candidates: " + sqlQuery);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, candidates) {
        if (err != null) {
          console.log("queryCandidates error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got a list of " + candidates.length + " candidates");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(candidates));
        res.end();
        dbWrapper.close();
      });
}

function queryPacs(req, res) {
  // TODO: Dedupe pacshort values with the same names but different cases (e.g.,
  // "Americans for Tax Reform" vs. "Americans For Tax Reform"), and make
  //  certain that all are queried if any is selected by the user.
  var sqlQuery = "select distinct pacshort, lower(pacshort) as key from Committees "
    + "where cycle = '2014' and pacshort != '' group by key order by key asc ";
  console.log("SQL query for list of PACs: " + sqlQuery);
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, pacs) {
        if (err != null) {
          console.log("queryPacs error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got a list of " + pacs.length + " PACs");
        res.writeHead(200, {"Content-Type": "application/json"});
        res.write(JSON.stringify(pacs));
        res.end();
        dbWrapper.close();
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

var server = Http.createServer(function(req, res) {
  router(req, res, Finalhandler(req, res))
})

server.listen(port, function() {
    console.log('Listening on http://localhost:' + port);
});
