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
  var maxContributionLinks = queryParams["maxContributionLinks"];
  var groupContributionsBy = queryParams["groupContributionsBy"];
  var contributionTypes = queryParams["contributionTypes"];
  console.log("Contribution types: " + contributionTypes);
  var db = new Sqlite3.Database(contributionsDbFile);
  res.writeHead(200, {"Content-Type": "application/json"});
  var links = [];
  var aggregateLinks = {};
  var contributionCounts = {};
  var negContributionCounte = {};
  var sqlQuery;
  if (groupContributionsBy == "PAC") {
    sqlQuery =
        "select PACShort as source, CmteID as sourceId, "
            + "FirstLastP as target, CID as targetId, DirectOrIndirect, Type, totalAmount as Amount from "
            + "(select PACShort, CmteID, FirstLastP, Candidates.CID, DirectOrIndirect, Type, "
                + "sum(Amount) as totalAmount from PACsToCandidates "
                + "inner join Candidates inner join Committees "
                    + "on PACsToCandidates.CID = Candidates.CID "
                    + "and PACsToCandidates.PACID = Committees.CmteID "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "and DirectOrIndirect in (" + contributionTypes + ") "
                + "group by PACShort, CmteID, FirstLastP, Candidates.CID, DirectOrIndirect, Type) "
                + "order by Amount desc ";
  } else if (groupContributionsBy == "Industry") {
    sqlQuery =
        "select CatName as source, CatCode as sourceId, "
            + "FirstLastP as target, CID as targetId, DirectOrIndirect, Type, totalAmount as Amount from "
            + "(select CatName, CatCode, FirstLastP, Candidates.CID, DirectOrIndirect, Type, "
                + "sum(Amount) as totalAmount from PACsToCandidates "
                + "inner join Candidates inner join Committees inner join Categories "
                    + "on PACsToCandidates.CID = Candidates.CID "
                    + "and PACsToCandidates.PACID = Committees.CmteID "
                    + "and Categories.CatCode = Committees.PrimCode "
                + "where Candidates.CID in (" + seedCandidates + ") "
                + "and DirectOrIndirect in (" + contributionTypes + ") "
                + "group by CatName, CatCode, FirstLastP, Candidates.CID, DirectOrIndirect) "
                + "order by Amount desc ";
  } else if (groupContributionsBy == "Sector") {
    sqlQuery =
      "select Sector as source, CatOrder as sourceId, "
          + "FirstLastP as target, CID as targetId, DirectOrIndirect, Type, totalAmount as Amount from "
          + "(select Sector, CatOrder, FirstLastP, Candidates.CID, DirectOrIndirect, Type, "
              + "sum(Amount) as totalAmount from PACsToCandidates "
              + "inner join Candidates inner join Committees inner join Categories "
                  + "on PACsToCandidates.CID = Candidates.CID "
                  + "and PACsToCandidates.PACID = Committees.CmteID "
                  + "and Categories.CatCode = Committees.PrimCode "
              + "where Candidates.CID in (" + seedCandidates + ") "
              + "and DirectOrIndirect in (" + contributionTypes + ") "
              + "group by Sector, CatOrder, FirstLastP, Candidates.CID, DirectOrIndirect, Type) "
              + "order by Amount desc ";
  } else {
    // TODO
  }
  var styleMapping = {
    "D": {
      "true": "red",
      "false": "plain",
    },
    "I": {
      "true": "red dashed",
      "false": "dashed",
    },
  }
  console.log("SQL query: " + sqlQuery);
  db.each(sqlQuery,
      function(err, row) {
        // TODO: Find a way to keep multiple links for contributions of separate types from the same
        // to the same target from being superimposed on top of each other.
        var isAgainst = (["24A", "24N"].indexOf(row.Type) != -1);
        var contributionKey = "key " + row.targetId + " " + row.DirectOrIndirect + " " + isAgainst;
        var numContributions =
            contributionCounts[contributionKey] || (contributionCounts[contributionKey] = 0);

        if (numContributions < maxContributionLinks) {
          row.isAgainst = isAgainst
          row.style = styleMapping[row.DirectOrIndirect][isAgainst];
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
              "style": styleMapping[row.DirectOrIndirect][isAgainst],
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
              "style": styleMapping[row.DirectOrIndirect][isAgainst],
              "isRefund": row.Amount < 0 ? true : false
            };
          }
        }
      },
      function() {
        for (var contributionKey in aggregateLinks) {
          links.push(aggregateLinks[contributionKey]);
          console.log("Adding aggregate link with key: " + contributionKey);
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
  db.each("select distinct CID, FirstLastP from Candidates "
      + "where Cycle = 2014 and CycleCand = 'Y' order by FirstLastP asc",
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
