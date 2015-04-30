
var initLinksPerRelative= 5;
var newLinksPerExpansion = 5;

function processRows(rows, aggregationType) {
  console.log("Got " + rows.length + " raw links ");

  var childType = aggregationType;
  var childIdType = childType + "id";
  var relativeType = aggregationType == "source" ? "target" : "source";
  var relativeIdType = relativeType + "id";

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

  function newAggregateLink(aggregateId, firstLink, isagainst) {
    var newCount = firstLink.count || 1;
    var newLink = {
      "id": aggregateId,
      "amount": firstLink.amount,
      "count": newCount,
      "directorindirect": firstLink.directorindirect,
      "isagainst": isagainst,
      "isRefund": firstLink.amount < 0 ? true : false,
      "subLinks": [ firstLink ],
      "childType": childType,
      "childIdType": childIdType,
      "relativeType": relativeType,
      "relativeIdType": relativeIdType
    };
    // It's up to the caller to set newLink[childType], since that's a pretty-printed string whose
    // format depends on the application-specific rendering of aggregate nodes.
    newLink[childIdType] = aggregateId;
    newLink[relativeIdType] = firstLink[relativeIdType];
    newLink[relativeType] = firstLink[relativeType];
    return newLink;
  }

  function getAggregateNodeId(row) {
    return "key " + row[relativeIdType] + " " + row.directorindirect + " " + row.isagainst;
  }

  function handleOneRow(row) {
    // This is necessary to normalize behavior between SQLite and PostgreSQL, since the former
    // resolved boolean expressions to 1 or 0, whereas the latter resolves them to true or false.
    row.isagainst = row.isagainst ? true : false;

    var relativeAndType = getAggregateNodeId(row);
        + row.isagainst;
    var numLinks = linkCounts[relativeAndType] || (linkCounts[relativeAndType] = 0);
  
    row.id = row[childIdType] + "; " + relativeAndType;
    row.isRefund = row.amount < 0 ? true : false;
  
    if (numLinks < initLinksPerRelative
        || linkExistenceMap[row[childIdType] + ", " + row[relativeIdType]]) {
      links.push(row);
      linkCounts[relativeAndType] = numLinks + 1;
      // TODO: Uncomment this once there's a better way to render multiple links between the same
      // two nodes.
      //
      //linkExistenceMap[row[childIdType] + ", " + row.[relativeIdType]] = true;
    } else {
      // We have enough links for to relative node to display already. We'll aggregate the remaining
      // links later.
      linksToAggregate.push(row);
    }
  }

  function aggregateOneRow(row) {
    var relativeAndType = getAggregateNodeId(row);

    var existingAggregateLink = aggregateLinks[relativeAndType];
    if (existingAggregateLink) {
      var newAmount = existingAggregateLink.amount + row.amount;
      var newCount = existingAggregateLink.count + 1;
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[relativeAndType] = newAggregateLink(relativeAndType, existingAggregateLink,
            row.isagainst);
      }
      var aggregateLink = aggregateLinks[relativeAndType];
      aggregateLink.subLinks.push(row);
      aggregateLink.count = newCount;
      aggregateLink.amount = newAmount;
      aggregateLink.isRefund = (newAmount < 0) ? true : false;
    } else {
      aggregateLinks[relativeAndType] = newAggregateLink(relativeAndType, row,
          row.isagainst);
    }
  }
}
