
var initLinksPerTargetAndType = 5;
var newLinksPerExpansion = 5;

function processRows(rows) {
  console.log("Got " + rows.length + " raw links ");

  var links = [];
  var linkExistenceMap = {};
  var linksToAggregate = [];
  var aggregateLinks = {};
  var linkCounts = {};

  rows.forEach(handleOneRow);
  // Aggregate the outstanding links in reverse order, to ensure that the ones with the highest
  // amounts will be displayed first if the user chooses to expand them.
  for (var i = linksToAggregate.length - 1; i >= 0; --i) {
    aggregateOneRow(linksToAggregate[i]);
  }
  for (var contributionKey in aggregateLinks) {
    links.push(aggregateLinks[contributionKey]);
    console.log("Adding aggregate link with key: " + contributionKey);
  }
  return links;

  function newAggregateLink(sourceid, firstLink, isagainst) {
    var newCount = firstLink.count || 1;
    var newLink = {
      "id": sourceid,  // == targetAndType
      "sourceid": sourceid,
      "source": newCount + " more contributors. Double click...",
      "targetid": firstLink.targetid,
      "target": firstLink.target,
      "amount": firstLink.amount,
      "count": newCount,
      "directorindirect": firstLink.directorindirect,
      "isagainst": isagainst,
      "isRefund": firstLink.amount < 0 ? true : false,
      "subLinks": [ firstLink ]
    };
    //console.log("New aggregate link for " + sourceid + " with amount " + firstLink.amount);
    return newLink;
  }
  
  function handleOneRow(row) {
    var targetAndType = "key " + row.targetid + " " + row.directorindirect + " " + row.isagainst;
    var numLinks = linkCounts[targetAndType] || (linkCounts[targetAndType] = 0);
  
    row.id = row.sourceid + "; " + targetAndType;
    row.isRefund = row.amount < 0 ? true : false;
  
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
    // source to the same target from being superimposed on top of each other.
    var targetAndType = "key " + row.targetid + " " + row.directorindirect + " " + row.isagainst;

    var existingAggregateLink = aggregateLinks[targetAndType];
    if (existingAggregateLink) {
      var newAmount = existingAggregateLink.amount + row.amount;
      var newCount = existingAggregateLink.count + 1;
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[targetAndType] = newAggregateLink(targetAndType, existingAggregateLink,
            row.isagainst);
      }
      var aggregateLink = aggregateLinks[targetAndType];
      aggregateLink.subLinks.push(row);
      aggregateLink.count = newCount;
      aggregateLink.amount = newAmount;
      aggregateLink.source = newCount + " more contributors. Double click..."
      aggregateLink.isRefund = (newAmount < 0) ? true : false;
    } else {
      aggregateLinks[targetAndType] = newAggregateLink(targetAndType, row,
          row.isagainst);
    }
  }
}
