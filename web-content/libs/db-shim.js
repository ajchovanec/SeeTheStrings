
var initLinksPerRelative = 5;
var newLinksPerExpansion = 5;

function processRows(rows, aggregateType, seedIds) {
  console.log("Got " + rows.length + " raw links ");

  // TODO: Use seedIds to identify the appropriate aggregateType on a per row basis, and do away
  // with the aggregateType argument above.

  var childType = aggregateType;
  var childIdType = childType + "id";
  var childNameType = childType + "name";
  var relativeType = aggregateType == "source" ? "target" : "source";
  var relativeIdType = relativeType + "id";
  var relativeNameType = relativeType + "name";

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
      "childNameType": childNameType,
      "relativeType": relativeType,
      "relativeIdType": relativeIdType,
      "relativeNameType": relativeNameType
    };
    // It's up to the caller to set newLink[childNameType], since that's a pretty-printed string
    // whose format depends on the application-specific rendering of aggregate nodes.
    newLink[childIdType] = aggregateId;
    newLink[relativeIdType] = firstLink[relativeIdType];
    newLink[relativeNameType] = firstLink[relativeNameType];
    // TODO: In the future some links may not have a party field. Consider finding a way to
    // generalize this.
    newLink.party = firstLink.party;
    return newLink;
  }

  function getAggregateNodeId(row) {
    return "key " + row[relativeIdType] + " " + row.directorindirect + " " + row.isagainst;
  }

  function handleOneRow(row) {
    // This is necessary to normalize behavior between SQLite and PostgreSQL, since the former
    // resolves boolean expressions to 1 or 0, whereas the latter resolves them to true or false.
    row.isagainst = row.isagainst ? true : false;

    var aggregateNodeId = getAggregateNodeId(row);
    var numLinks = linkCounts[aggregateNodeId] || (linkCounts[aggregateNodeId] = 0);

    row.id = row[childIdType] + "; " + aggregateNodeId;
    row.isRefund = row.amount < 0;

    if (numLinks < initLinksPerRelative
        || linkExistenceMap[row[childIdType] + ", " + row[relativeIdType]]) {
      links.push(row);
      linkCounts[aggregateNodeId] = numLinks + 1;
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
    var aggreagateNodeId = getAggregateNodeId(row);

    var existingAggregateLink = aggregateLinks[aggreagateNodeId];
    if (existingAggregateLink) {
      var newAmount = existingAggregateLink.amount + row.amount;
      var newCount = existingAggregateLink.count + 1;
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[aggreagateNodeId] =
            newAggregateLink(aggreagateNodeId, existingAggregateLink, row.isagainst);
      }
      var aggregateLink = aggregateLinks[aggreagateNodeId];
      aggregateLink.subLinks.push(row);
      aggregateLink.count = newCount;
      aggregateLink.amount = newAmount;
      aggregateLink.isRefund = (newAmount < 0);
      // TODO: In the future some links may not have a party field. Consider finding a way to
      // generalize this.
      if (row.party != aggregateLink.party) {
        aggregateLink.party = null;
      }
    } else {
      aggregateLinks[aggreagateNodeId] = newAggregateLink(aggreagateNodeId, row, row.isagainst);
    }
  }
}
