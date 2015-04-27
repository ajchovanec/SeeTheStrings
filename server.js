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

var initLinksPerTargetAndType = 5;
var newLinksPerExpansion = 5;

function queryContributions(req, res) {
  // TODO: Figure out how to display both positive and negative contributions from the same source.
  var url = req.url;
  var queryParams = Url.parse(url, true).query;
  var seedCandidates = queryParams["candidates"];
  var groupCandidatesBy = queryParams["groupCandidatesBy"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var contributionTypes = queryParams["contributionTypes"];
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

  var links = [];
  var linkExistenceMap = {};
  var linksToAggregate = [];
  var aggregateLinks = {};
  var linkCounts = {};

  function newAggregateLink(sourceid, firstLink, isAgainst) {
    var newCount = firstLink.count || 1;
    var newLink = {
      "id": sourceid,  // == targetAndType
      "sourceid": sourceid,
      "source": newCount + " more contributors. Double click...",
      "targetid": firstLink.targetid,
      "target": firstLink.target,
      "amount": firstLink.amount,
      "count": newCount,
      "label": (firstLink.amount >= 0 ? "+" : "-") + "$" + Math.abs(firstLink.amount),
      "directorindirect": firstLink.directorindirect,
      "isAgainst": isAgainst,
      "isRefund": firstLink.amount < 0 ? true : false,
      "subLinks": [ firstLink ]
    };
    //console.log("New aggregate link for " + sourceid + " with amount " + firstLink.amount);
    return newLink;
  }

  function handleOneRow(row) {
    var isAgainst = (["24A", "24N"].indexOf(row.type) != -1);
    var targetAndType = "key " + row.targetid + " " + row.directorindirect + " " + isAgainst;
    var numLinks = linkCounts[targetAndType] || (linkCounts[targetAndType] = 0);

    row.id = row.sourceid + "; " + targetAndType;
    row.isAgainst = isAgainst;
    // TODO: Revisit logic around the display of refunds. If we're going to reverse the direction of
    // the arrow, should we also drop the minus sign?
    row.isRefund = row.amount < 0 ? true : false;
    row.label = (row.amount >= 0 ? "+" : "-") + "$" + Math.abs(row.amount);

    if (numLinks < initLinksPerTargetAndType
        || linkExistenceMap[row.sourceid + ", " + row.targetid]) {
      links.push(row);
      linkCounts[targetAndType] = numLinks + 1;
      // TODO: Uncomment this once there's a better way to render multiple links between the same
      // two nodes.
      //
      //linkExistenceMap[row.sourceid + ", " + row.targetid] = true;
    } else {
      // We have enough source links for this target node to display already We'll aggregate the
      // remaining links later.
      linksToAggregate.push(row);
    }
  }

  function aggregateOneRow(row) {
    // TODO: Find a way to keep multiple links for contributions of separate types from the same
    // to the same target from being superimposed on top of each other.
    var targetAndType = "key " + row.targetid + " " + row.directorindirect + " " + row.isAgainst;

    var existingAggregateLink = aggregateLinks[targetAndType];
    if (existingAggregateLink) {
      var newAmount = existingAggregateLink.amount + row.amount;
      var newCount = existingAggregateLink.count + 1;
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[targetAndType] = newAggregateLink(targetAndType, existingAggregateLink,
            row.isAgainst);
      }
      aggregateLinks[targetAndType].subLinks.push(row);
      aggregateLinks[targetAndType].count = newCount;
      aggregateLinks[targetAndType].amount = newAmount;
      aggregateLinks[targetAndType].source = newCount + " more contributors. Double click..."
      aggregateLinks[targetAndType].label =
          (newAmount >= 0 ? "+" : "-") + "$" + Math.abs(newAmount);
      aggregateLinks[targetAndType].isRefund = (newAmount < 0) ? true : false;
    } else {
      aggregateLinks[targetAndType] = newAggregateLink(targetAndType, row,
          row.isAgainst);
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
        // Aggregate the outstanding links in reverse order, to ensure that the ones with the
        // highest amounts will be displayed first if the user chooses to expand them.
        for (i = linksToAggregate.length - 1; i >= 0; --i) {
          aggregateOneRow(linksToAggregate[i]);
        }
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
