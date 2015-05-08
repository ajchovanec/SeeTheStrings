var Finalhandler = require('finalhandler')
var Http = require('http')
var Router = require('router')
var Url = require('url');
var ServeStatic = require('serve-static')
var DBWrapper = require('node-dbi').DBWrapper;
var CacheManager = require('cache-manager');

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

function queryContributions(req, res) {
  // TODO: Figure out how to display both positive and negative contributions from the same source.
  var url = req.url;
  var queryParams = Url.parse(url, true).query;
  var seedType = queryParams["seedType"];
  var seedRace = queryParams["race"];
  var seedCandidates = queryParams["candidates"];
  var seedPacs = queryParams["pacs"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var contributionTypes = queryParams["contributionTypes"];
  var sqlQuery;
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as targetname, -1 as targetid, "
      : "firstlastp as targetname, cid as targetid, party, ";
  var outerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "targetname, targetid, party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var seedMatchingCriteria;
  if (seedType == "Race") {
    seedMatchingCriteria = "Candidates.distidrunfor = " + seedRace
        + " and Candidates.currCand = 'Y' ";
  } else if (seedType == "Candidate") {
    seedMatchingCriteria = "Candidates.cid in (" + seedCandidates + ") ";
  } else if (seedType == "PAC") {
    seedMatchingCriteria = "Committees.cmteid in (" + seedPacs + ") ";
  } else {
    // TODO
  }
  console.log("groupCandidatesBy: " + groupCandidatesBy);
  console.log("outerSelectTargets: " + outerSelectTargets);
  if (groupContributionsBy == "PAC") {
    sqlQuery =
        "select pacshort as sourcename, cmteid as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, pacshort, cmteid, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by sourcename, sourceid, " + outerGroupByTargets
            + "directorindirect, isagainst "
            + "order by amount desc ";
  } else if (groupContributionsBy == "Industry") {
    sqlQuery =
        "select catname as sourcename, catcode as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, catname, catcode, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by sourcename, sourceid, " + outerGroupByTargets
            + "directorindirect, isagainst "
            + "order by amount desc ";
  } else if (groupContributionsBy == "Sector") {
    sqlQuery =
        "select sector as sourcename, sector as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, sector, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by sourcename, sourceid, " + outerGroupByTargets
            + "directorindirect, isagainst "
            + "order by amount desc ";
  } else {
    // TODO
  }

  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  console.log("SQL query: " + sqlQuery);
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
  var sqlQuery = "select distinct cmteid, pacshort, lower(pacshort) as sortkey "
      + "from Committees where cycle = '2014' and pacshort != '' order by sortkey asc ";
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
router.get('/data', queryContributions);
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
