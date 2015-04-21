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
  var seedCandidates = queryParams["candidates"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var contributionTypes = queryParams["contributionTypes"];
  var maxContributionLinks = queryParams["maxContributionLinks"];
  res.writeHead(200, {"Content-Type": "application/json"});
  var sqlQuery;
  var outerSelectTargets = (groupCandidatesBy == "Selection")
      ? "'Misc candidates' as target, -1 as targetid, "
      : "firstlastp as target, cid as targetid, party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  var innerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "firstlastp, Candidates.cid, Candidates.party, ";
  console.log("groupCandidatesBy: " + groupCandidatesBy);
  console.log("outerSelectTargets: " + outerSelectTargets);
  if (groupContributionsBy == "PAC") {
    sqlQuery =
        "select pacshort as source, cmteid as sourceid, " + outerSelectTargets
            + "directorindirect, type, totalamount as amount from "
            + "(select pacshort, cmteid, " + innerSelectTargets + "directorindirect, type, "
                + "sum(amount) as totalamount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "where Candidates.cid in (" + seedCandidates + ") "
                + "and directorindirect in (" + contributionTypes + ") "
                + "group by pacshort, cmteid, " + innerGroupByTargets + "directorindirect, type) "
            + "as Subquery order by amount desc ";
  } else if (groupContributionsBy == "Industry") {
    sqlQuery =
        "select catname as source, catcode as sourceid, " + outerSelectTargets
            + "directorindirect, type, totalamount as amount from "
            + "(select catname, catcode, " + innerSelectTargets + "directorindirect, type, "
                + "sum(amount) as totalamount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where Candidates.cid in (" + seedCandidates + ") "
                + "and directorindirect in (" + contributionTypes + ") "
                + "group by catname, catcode, " + innerGroupByTargets + "directorindirect, type) "
            + "as Subquery order by amount desc ";
  } else if (groupContributionsBy == "Sector") {
    sqlQuery =
        "select sector as source, sector as sourceid, " + outerSelectTargets
            + "directorindirect, type, totalamount as amount from "
            + "(select sector, " + innerSelectTargets + "directorindirect, type, "
                + "sum(amount) as totalamount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.cid = Candidates.cid "
                + "inner join Committees on PACsToCandidates.pacid = Committees.cmteid "
                + "inner join Categories on Categories.catcode = Committees.primcode "
                + "where Candidates.cid in (" + seedCandidates + ") "
                + "and directorindirect in (" + contributionTypes + ") "
                + "group by sector, " + innerGroupByTargets + "directorindirect, type) "
            + "as Subquery order by amount desc ";
  } else {
    // TODO
  }

  var linkStyleMapping = {
    "D": {
      "true": "plain red",
      "false": "plain gray",
    },
    "I": {
      "true": "dashed red",
      "false": "dashed gray",
    },
  }
  var markerColorMapping = {
    "true": "red",
    "false": "black"
  }

  var links = [];
  var aggregateLinks = {};
  var contributionCounts = {};
  var negContributionCounte = {};

  function handleOneRow(row) {
    // TODO: Find a way to keep multiple links for contributions of separate types from the same
    // to the same target from being superimposed on top of each other.
    var isAgainst = (["24A", "24N"].indexOf(row.type) != -1);
    var contributionKey = "key " + row.targetid + " " + row.directorindirect + " " + isAgainst;
    var numContributions =
        contributionCounts[contributionKey] || (contributionCounts[contributionKey] = 0);

    if (numContributions < maxContributionLinks) {
      row.isAgainst = isAgainst
      row.style = linkStyleMapping[row.directorindirect][isAgainst];
      row.color = markerColorMapping[isAgainst];
      row.isRefund = row.amount < 0 ? true : false;
      row.label = (row.amount >= 0 ? "+" : "-") + "$" + Math.abs(row.amount);
      links.push(row);
      contributionCounts[contributionKey] = numContributions + 1;
    } else {
      var existingAggregateLink = aggregateLinks[contributionKey];
      if (existingAggregateLink) {
        var newAmount = existingAggregateLink.amount + row.amount;
        aggregateLinks[contributionKey] = {
          "sourceid": contributionKey,
          "source": "Misc. contributors",
          "targetid": row.targetid,
          "target": row.target,
          "amount": newAmount,
          "label": (newAmount >= 0 ? "+" : "-") + "$" + Math.abs(newAmount),
          "isAgainst": isAgainst,
          "style": linkStyleMapping[row.directorindirect][isAgainst],
          "color": markerColorMapping[isAgainst],
          "isRefund": newAmount < 0 ? true : false
        };
      } else {
        aggregateLinks[contributionKey] = {
          "sourceid": contributionKey,
          "source": row.source,
          "targetid": row.targetid,
          "target": row.target,
          "amount": row.amount,
          "label": (row.amount >= 0 ? "+" : "-") + "$" + Math.abs(row.amount),
          "isAgainst": isAgainst,
          "style": linkStyleMapping[row.directorindirect][isAgainst],
          "color": markerColorMapping[isAgainst],
          "isRefund": row.amount < 0 ? true : false
        };
      }
    }
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
        console.log("Got " + result.length + " raw links ");
        result.forEach(handleOneRow);
        for (var contributionKey in aggregateLinks) {
          links.push(aggregateLinks[contributionKey]);
          console.log("Adding aggregate link with key: " + contributionKey);
        }
        //dbWrapper.close(function(err) { console.log('Connection closed!'); });
        res.write(JSON.stringify(links));
        res.end();
      });
}
      
function queryAllCandidates(req, res) {
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
          console.log("queryAllCandidates error: " + JSON.stringify(err));
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

var router = Router()
router.get('/data', queryContributions);
router.get('/candidates', queryAllCandidates);
router.use('/', ServeStatic('web-content', {'index': ['form.html']}));

var server = Http.createServer(function(req, res) {
  router(req, res, Finalhandler(req, res))
})

server.listen(port, function() {
    console.log('Listening on http://localhost:' + port);
});
