var finalhandler = require('finalhandler')
var http = require('http')
var Router = require('router')
var Url = require('url');
var serveStatic = require('serve-static')
var fs = require("fs");
var sqlite3 = require("sqlite3").verbose();

var contributionsDbFile = "data/sqlite/CampaignFin14.db";

function queryContributions(req, res) {
  // TODO: Figure out how to display both positive and negative contributions from the same source.
  var url = req.url;
  var queryParams = Url.parse(url, true).query;
  var seedCandidates = queryParams["candidates"];
  var maxContributions = queryParams["maxContributions"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var db = new sqlite3.Database(contributionsDbFile);
  res.writeHead(200, {"Content-Type": "application/json"});
  var links = [];
  var aggregateLinks = {};
  var contributionCounts = {};
  var negContributionCounte = {};
  var sqlQuery;
  if (groupContributionsBy == "PAC") {
    sqlQuery =
        "select PACShort as source, CmteID as sourceId, "
            + "FirstLastP as target, CID as targetId, totalAmount as Amount from "
            + "(select PACShort, CmteID, FirstLastP, Candidates.CID, "
                + "abs(Amount)/Amount as AmountSign, sum(Amount) as totalAmount "
                + "from PACsToCandidates "
                + "inner join Candidates inner join Committees "
                    + "on PACsToCandidates.CID = Candidates.CID "
                    + "and PACsToCandidates.PACID = Committees.CmteID "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "group by PACShort, CmteID, FirstLastP, Candidates.CID, AmountSign) "
                + "order by Amount desc ";
  } else if (groupContributionsBy == "Industry"){
    sqlQuery =
        "select CatName as source, CatCode as sourceId, "
            + "FirstLastP as target, CID as targetId, totalAmount as Amount from "
            + "(select CatName, CatCode, FirstLastP, Candidates.CID, "
                + "abs(Amount)/Amount as AmountSign, sum(Amount) as totalAmount "
                + "from PACsToCandidates "
                + "inner join Candidates inner join Committees inner join Categories "
                    + "on PACsToCandidates.CID = Candidates.CID "
                    + "and PACsToCandidates.PACID = Committees.CmteID "
                    + "and Categories.CatCode = Committees.PrimCode "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "group by CatName, CatCode, FirstLastP, Candidates.CID, AmountSign) "
                + "order by Amount desc ";
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
          links.push(row);
          contributionCounts[contributionKey] = numContributions + 1;
        } else {
          var existingAggregateLink = aggregateLinks[contributionKey];
          if (existingAggregateLink) {
            var newAmount = existingAggregateLink.Amount + row.Amount;
            aggregateLinks[contributionKey] = {
              "sourceId": contributionKey,
              "source": (newAmount >= 0 ? "+" : "-") + "$" + Math.abs(newAmount)
                  + ", misc. contributors",
              "targetId": row.targetId,
              "target": row.target,
              "Amount": newAmount,
              "type": newAmount >= 0 ? "plain" : "red"
            };
          } else {
            aggregateLinks[contributionKey] = {
              "sourceId": contributionKey,
              "source": (row.Amount >= 0 ? "+" : "-") + "$" + Math.abs(row.Amount)
                  + ", misc. contributors",
              "targetId": row.targetId,
              "target": row.target,
              "Amount": row.Amount,
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
  var db = new sqlite3.Database(contributionsDbFile);
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
router.use('/', serveStatic('web-content', {'index': ['form.html']}));

var server = http.createServer(function(req, res) {
  router(req, res, finalhandler(req, res))
})

server.listen(3000);
