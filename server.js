var Finalhandler = require('finalhandler')
var Http = require('http')
var Router = require('router')
var Url = require('url');
var ServeStatic = require('serve-static')
var DBWrapper = require('node-dbi').DBWrapper;

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

function getDbWrapper() {
  return new DBWrapper(dbType, dbConnectionConfig);
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
      ? "\"Misc candidates\" as target, -1 as targetId, "
      : "FirstLastP as target, CID as targetId, Party, ";
  var innerSelectTargets = (groupCandidatesBy == "Selection") ? ""
      : "FirstLastP, Candidates.CID, Candidates.Party, ";
  var innerGroupByTargets = (groupCandidatesBy == "Selection") ? ""
      : "Candidates.CID, Candidates.Party, FirstLastP, ";
  console.log("groupCandidatesBy: " + groupCandidatesBy);
  console.log("outerSelectTargets: " + outerSelectTargets);
  if (groupContributionsBy == "PAC") {
    sqlQuery =
        "select PACShort as source, CmteID as sourceId, " + outerSelectTargets
            + "DirectOrIndirect, Type, totalAmount as Amount from "
            + "(select PACShort, CmteID, " + innerSelectTargets + "DirectOrIndirect, Type, "
                + "sum(Amount) as totalAmount from PACsToCandidates "
                + "inner join Candidates on PACsToCandidates.CID = Candidates.CID "
                + "inner join Committees on PACsToCandidates.PACID = Committees.CmteID "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "and DirectOrIndirect in (" + contributionTypes + ") "
                + "group by PACShort, CmteID, " + innerGroupByTargets + "DirectOrIndirect, Type) "
            + "as Subquery order by Amount desc ";
  } else if (groupContributionsBy == "Industry") {
    sqlQuery =
        "select CatName as source, CatCode as sourceId, " + outerSelectTargets
            + "DirectOrIndirect, Type, totalAmount as Amount from "
            + "(select CatName, CatCode, " + innerSelectTargets + "DirectOrIndirect, Type, "
                + "sum(Amount) as totalAmount from PACsToCandidates "
                + "inner join Candidates inner join Committees inner join Categories "
                    + "on PACsToCandidates.CID = Candidates.CID "
                    + "and PACsToCandidates.PACID = Committees.CmteID "
                    + "and Categories.CatCode = Committees.PrimCode "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "and DirectOrIndirect in (" + contributionTypes + ") "
                + "group by CatName, CatCode, " + innerGroupByTargets + "DirectOrIndirect) "
                + "order by Amount desc ";
  } else if (groupContributionsBy == "Sector") {
    sqlQuery =
      "select Sector as source, Sector as sourceId, " + outerSelectTargets
          + "DirectOrIndirect, Type, totalAmount as Amount from "
          + "(select Sector, " + innerSelectTargets + "DirectOrIndirect, Type, "
              + "sum(Amount) as totalAmount from PACsToCandidates "
              + "inner join Candidates inner join Committees inner join Categories "
                  + "on PACsToCandidates.CID = Candidates.CID "
                  + "and PACsToCandidates.PACID = Committees.CmteID "
                  + "and Categories.CatCode = Committees.PrimCode "
              + "where Candidates.CID in (" + seedCandidates + ") "
              + "and DirectOrIndirect in (" + contributionTypes + ") "
              + "group by Sector, " + innerGroupByTargets + "DirectOrIndirect, Type) "
              + "order by Amount desc ";
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
    var isAgainst = (["24A", "24N"].indexOf(row.Type) != -1);
    var contributionKey = "key " + row.targetId + " " + row.DirectOrIndirect + " " + isAgainst;
    var numContributions =
        contributionCounts[contributionKey] || (contributionCounts[contributionKey] = 0);

    if (numContributions < maxContributionLinks) {
      row.isAgainst = isAgainst
      row.style = linkStyleMapping[row.DirectOrIndirect][isAgainst];
      row.color = markerColorMapping[isAgainst];
      row.isRefund = row.Amount < 0 ? true : false;
      row.label = (row.Amount >= 0 ? "+" : "-") + "$" + Math.abs(row.Amount);
      links.push(row);
      contributionCounts[contributionKey] = numContributions + 1;
    } else {
      var existingAggregateLink = aggregateLinks[contributionKey];
      if (existingAggregateLink) {
        var newAmount = existingAggregateLink.Amount + row.Amount;
        aggregateLinks[contributionKey] = {
          "sourceId": contributionKey,
          "source": "Misc. contributors",
          "targetId": row.targetId,
          "target": row.target,
          "Amount": newAmount,
          "label": (newAmount >= 0 ? "+" : "-") + "$" + Math.abs(newAmount),
          "isAgainst": isAgainst,
          "style": linkStyleMapping[row.DirectOrIndirect][isAgainst],
          "color": markerColorMapping[isAgainst],
          "isRefund": newAmount < 0 ? true : false
        };
      } else {
        aggregateLinks[contributionKey] = {
          "sourceId": contributionKey,
          "source": row.source,
          "targetId": row.targetId,
          "target": row.target,
          "Amount": row.Amount,
          "label": (row.Amount >= 0 ? "+" : "-") + "$" + Math.abs(row.Amount),
          "isAgainst": isAgainst,
          "style": linkStyleMapping[row.DirectOrIndirect][isAgainst],
          "color": markerColorMapping[isAgainst],
          "isRefund": row.Amount < 0 ? true : false
        };
      }
    }
  }

  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  console.log("SQL query: " + sqlQuery);
  dbWrapper.fetchAll(sqlQuery,
      null,
      function(err, result) {
        if (err != null) {
          console.log("queryAllCandidatesError: " + JSON.stringify(err));
          // TODO: Should we exit here?
        }
        console.log("Got " + result.length + " raw links ");
        result.forEach(handleOneRow);
        for (var contributionKey in aggregateLinks) {
          links.push(aggregateLinks[contributionKey]);
          console.log("Adding aggregate link with key: " + contributionKey);
        }
        console.log(JSON.stringify(links));
        //dbWrapper.close(function(err) { console.log('Connection closed!'); });
        res.write(JSON.stringify(links));
        res.end();
      });
}
      
function queryAllCandidates(req, res) {
  var sqlQuery = "select distinct CID, FirstLastP from Candidates where Cycle = '2014' "
    + "and CycleCand = 'Y' order by FirstLastP asc";
  console.log("SQL query for list of candidates: " + sqlQuery);
  res.writeHead(200, {"Content-Type": "application/json"});
  var candidates = [];
  var dbWrapper = getDbWrapper();
  dbWrapper.connect();
  dbWrapper.fetchAll(sqlQuery,
      null,
      function(err, result) {
        if (err != null) {
          console.log("queryAllCandidatesError: " + JSON.stringify(err));
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
