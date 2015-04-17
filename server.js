var Finalhandler = require('finalhandler')
var Http = require('http')
var Router = require('router')
var Url = require('url');
var ServeStatic = require('serve-static')
var Sqlite3 = require("sqlite3").verbose();

var contributionsDbFile = "data/sqlite/CampaignFin14.db";

function queryContributions(req, res) {
  // TODO: Figure out how to display both positive and negative contributions from the same source.
  var url = req.url;
  var queryParams = Url.parse(url, true).query;
  var seedCandidates = queryParams["candidates"];
  var maxContributions = queryParams["maxContributions"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var db = new Sqlite3.Database(contributionsDbFile);
  res.writeHead(200, {"Content-Type": "application/json"});
  var links = [];
  var aggregateLinks = {};
  var contributionCounts = {};
  var negContributionCounte = {};
  var sqlQuery;
  var sqlQueryFormat = 
      "select SOURCE_NAME as source, SOURCE_ID as sourceId, "
      + "FirstLastP as target, CID as targetId, totalAmount as Amount from "
      + "(select SOURCE_NAME, SOURCE_ID, FirstLastP, Candidates.CID, "
          + "abs(Amount)/Amount as AmountSign, sum(Amount) as totalAmount "
          + "from PACsToCandidates "
          + "inner join Candidates inner join Committees inner join Categories "
              + "on PACsToCandidates.CID = Candidates.CID "
              + "and PACsToCandidates.PACID = Committees.CmteID "
              + "and Categories.CatCode = Committees.PrimCode "
          + "where Candidates.CID in (" + seedCandidates + ") "
          + "group by SOURCE_NAME, SOURCE_ID, FirstLastP, Candidates.CID, AmountSign) "
          + "order by Amount desc ";
  if (groupContributionsBy == "PAC") {
    sqlQuery = sqlQueryFormat.replace(/SOURCE_NAME/g, "PACShort")
        .replace(/SOURCE_ID/g, "CmteId");
  } else if (groupContributionsBy == "Industry") {
    sqlQuery = sqlQueryFormat.replace(/SOURCE_NAME/g, "CatName")
        .replace(/SOURCE_ID/g, "CatCode");
  } else if (groupContributionsBy == "Sector") {
    sqlQuery = sqlQueryFormat.replace(/SOURCE_NAME/g, "Sector")
        .replace(/SOURCE_ID/g, "Sector");
  } else {
    // TODO
  }
  console.log("SQL query: " + sqlQuery);
  db.each(sqlQuery,
      function(err, row) {
        var contributionKey = (row.Amount >= 0 ? "+" : "-") + row.targetId;
        var numContributions =
            contributionCounts[contributionKey] || (contributionCounts[contributionKey] = 0);

        if (Math.abs(row.Amount) >= 0 && numContributions < maxContributions) {
          row.type = row.Amount >= 0 ? "plain" : "red";
          row.label = "$" + row.Amount;
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
              "type": newAmount >= 0 ? "plain" : "red"
            };
          } else {
            aggregateLinks[contributionKey] = {
              "sourceId": contributionKey,
              "source": row.source,
              "targetId": row.targetId,
              "target": row.target,
              "Amount": row.Amount,
              "label": (row.Amount >= 0 ? "+" : "-") + "$" + Math.abs(row.Amount),
              "type": row.Amount >= 0 ? "plain" : "red"
            };
          }
        }
      },
      function() {
        for (var contributionKey in aggregateLinks) {
          if (Math.abs(aggregateLinks[contributionKey].Amount) >= 0) {
            links.push(aggregateLinks[contributionKey]);
           }
        }
        res.write(JSON.stringify(links));
        res.end();
        db.close();
      });
}

function queryAllCandidates(req, res) {
  var db = new Sqlite3.Database(contributionsDbFile);
  res.writeHead(200, {"Content-Type": "application/json"});
  var candidates = [];
  db.each("select CID, FirstLastP from Candidates where Cycle = 2014 order by FirstLastP asc",
      function(err, row) {
        candidates.push(row);
      },
      function() {
        res.write(JSON.stringify(candidates));
        res.end();
        db.close();
      });
}

var router = Router()
router.get('/data', queryContributions);
router.get('/candidates', queryAllCandidates);
router.use('/', ServeStatic('web-content', {'index': ['form.html']}));

var server = Http.createServer(function(req, res) {
  router(req, res, Finalhandler(req, res))
})

server.listen(3000);
