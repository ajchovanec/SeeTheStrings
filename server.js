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
          this.dbWrapper.connect();
        },
    fetchAll:
        function(sqlQuery, callback) {
          var parentDbWrapper = this.dbWrapper;
          memoryCache.wrap(
              sqlQuery,
              function (cacheCallback) {
                console.log("Cache miss, querying the SQL database")
                parentDbWrapper.fetchAll(sqlQuery, null, cacheCallback);
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
  var seedCandidates = queryParams["candidates"];
  var seedPacs = queryParams["pacs"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var contributionTypes = queryParams["contributionTypes"];
  res.writeHead(200, {"Content-Type": "application/json"});
  var sqlQuery;
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as target, -1 as targetid, "
      : "firstlastp as target, cid as targetid, party, ";
  var outerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "target, targetid, party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var seedMatchingCriteria;
  if (seedType == "Candidate") {
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
        "select pacshort as source, cmteid as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, pacshort, cmteid, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by source, sourceid, " + outerGroupByTargets + "directorindirect, isagainst "
            + "order by amount desc ";
  } else if (groupContributionsBy == "Industry") {
    sqlQuery =
        "select catname as source, catcode as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, catname, catcode, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by source, sourceid, " + outerGroupByTargets + "directorindirect, isagainst "
            + "order by amount desc ";
  } else if (groupContributionsBy == "Sector") {
    sqlQuery =
        "select sector as source, sector as sourceid, " + outerSelectTargets
            + "directorindirect, isagainst, sum(amount) as amount from "
            + "(select distinct fecrecno, sector, " + innerSelectTargets
                + "directorindirect, type in ('24A', '24N') as isagainst, "
                + "amount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where " + seedMatchingCriteria
                + "and directorindirect in (" + contributionTypes + ")) as SubQuery "
            + "group by source, sourceid, " + outerGroupByTargets + "directorindirect, isagainst "
            + "order by amount desc ";
  } else {
    // TODO
  }

  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  console.log("SQL query: " + sqlQuery);
  dbWrapper.fetchAll(sqlQuery,
      function(err, result) {
        if (err != null) {
          console.log("query error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        //dbWrapper.close(function(err) { console.log('Connection closed!'); });
        res.write(JSON.stringify(result));
        res.end();
      });
}
      
function queryCandidates(req, res) {
  var sqlQuery = "select distinct cid, firstlastp from Candidates where cycle = '2014' "
      + "and cyclecand = 'Y' order by firstlastp asc ";
  console.log("SQL query for list of candidates: " + sqlQuery);
  res.writeHead(200, {"Content-Type": "application/json"});
  var candidates = [];
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, result) {
        if (err != null) {
          console.log("queryCandidates error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got a list of " + result.length + " candidates");
        result.forEach(function(row) {
          candidates.push(row);
        });
        //dbWrapper.close(function(err) { console.log('Connection closed!'); });
        res.write(JSON.stringify(candidates));
        res.end();
      });
}

function queryPacs(req, res) {
  var sqlQuery = "select distinct cmteid, pacshort from Committees where cycle = '2014' "
      + "and pacshort != '' order by pacshort asc";
  console.log("SQL query for list of PACs: " + sqlQuery);
  res.writeHead(200, {"Content-Type": "application/json"});
  var pacs = [];
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      function(err, result) {
        if (err != null) {
          console.log("queryPacs error: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got a list of " + result.length + " PACs");
        result.forEach(function(row) {
          pacs.push(row);
        });
        //dbWrapper.close(function(err) { console.log('Connection closed!'); });
        res.write(JSON.stringify(pacs));
        res.end();
      });
}

var router = Router()
router.get('/data', queryContributions);
router.get('/candidates', queryCandidates);
router.get('/pacs', queryPacs);
router.use('/', ServeStatic('web-content', {'index': ['form.html']}));

var server = Http.createServer(function(req, res) {
  router(req, res, Finalhandler(req, res))
})

server.listen(port, function() {
    console.log('Listening on http://localhost:' + port);
});
