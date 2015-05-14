
var initLinksPerRelative = 5;
var newLinksPerExpansion = 5;

function getAggregateProperties(aggregateType) {
  var childType = aggregateType;
  var relativeType = (aggregateType == "source") ? "target" : "source";
  return {
    "childType": childType,
    "childIdType": childType + "id",
    "childNameType": childType + "name",
    "relativeType": relativeType,
    "relativeIdType": relativeType + "id",
    "relativeNameType": relativeType + "name"
  };
}

function processRows(rows, aggregateType, seedIds) {
  console.log("Got " + rows.length + " raw links ");

  // TODO: Use seedIds to identify the appropriate aggregateType on a per row basis, and do away
  // with the aggregateType argument above. Remember that they are all wrapped in single quotes, so
  // string comparisons with raw node IDs will fail.

  var links = [];
  var linkExistenceMap = {};
  var linksToAggregate = { "source": [], "target": [] };
  var aggregateLinks = {};
  var linkCounts = {};

  rows.forEach(
      function(row) {
        row.isRefund = row.amount < 0;

        // This is necessary to normalize behavior between SQLite and PostgreSQL, since the former
        // resolves boolean expressions to 1 or 0, but the latter resolves them to true or false.
        row.isagainst = row.isagainst ? true : false;

        handleRowAggregateType(row, aggregateType);
      });

  // Aggregate the outstanding links in reverse order, to ensure that the ones with the highest
  // amounts will be displayed first if the user chooses to expand them.
  //
  // TODO: Use a forEach call on linksToAggregate instead of two for loops.
  for (var aggregateType in linksToAggregate) {
    for (var i = linksToAggregate[aggregateType].length - 1; i >= 0; --i) {
      aggregateRow(linksToAggregate[aggregateType][i], aggregateType);
    }
  }
  for (var contributionKey in aggregateLinks) {
    links.push(aggregateLinks[contributionKey]);
    console.log("Adding aggregate link with key: " + contributionKey);
  }
  return links;

  function getAggregateNodeId(row, relativeId) {
    return "key " + relativeId + " " + row.directorindirect + " " + row.isagainst;
  }

  function handleRowAggregateType(row, aggregateType) {
    var properties = getAggregateProperties(aggregateType);

    row.id = row[properties.childIdType] + "; " + aggregateNodeId;

    var aggregateNodeId = getAggregateNodeId(row, row[properties.relativeIdType]);
    var numLinks = linkCounts[aggregateNodeId] || (linkCounts[aggregateNodeId] = 0);

    if (numLinks < initLinksPerRelative
        || linkExistenceMap[row[properties.childIdType] + ", " + row[properties.relativeIdType]]) {
      links.push(row);
      linkCounts[aggregateNodeId] = numLinks + 1;
      // TODO: Uncomment this once there's a better way to render multiple links between the same
      // two nodes.
      //
      //linkExistenceMap[row[childIdType] + ", " + row.[relativeIdType]] = true;
    } else {
      // We have enough links for to relative node to display already. We'll aggregate the remaining
      // links later.
      linksToAggregate[aggregateType].push(row);
    }
  }

  function aggregateRow(row, aggregateType) {
    // TODO: Try to avoid calculating all properties here, since we only need relativeIdType.
    var properties = getAggregateProperties(aggregateType);
    var aggreagateNodeId = getAggregateNodeId(row, row[properties.relativeIdType]);

    var existingAggregateLink = aggregateLinks[aggreagateNodeId];
    if (existingAggregateLink) {
      var newAmount = existingAggregateLink.amount + row.amount;
      var newCount = existingAggregateLink.count + 1;
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[aggreagateNodeId] =
            newAggregateLink(aggreagateNodeId, aggregateType, existingAggregateLink, row.isagainst);
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
      aggregateLinks[aggreagateNodeId] =
          newAggregateLink(aggreagateNodeId, aggregateType, row, row.isagainst);
    }

    function newAggregateLink(aggregateId, aggregateType, firstLink, isagainst) {
      var newCount = firstLink.count || 1;

      var newLink = getAggregateProperties(aggregateType);
      newLink.id = aggregateId;
      newLink.amount = firstLink.amount;
      newLink.count = newCount;
      newLink.directorindirect = firstLink.directorindirect;
      newLink.isagainst = isagainst;
      newLink.isRefund = firstLink.amount < 0 ? true : false;
      newLink.subLinks = [ firstLink ];

      // It's up to the caller to set newLink[newLink.childNameType], since that's a pretty-printed
      // string whose format depends on the application-specific rendering of aggregate nodes.
      newLink[newLink.childIdType] = aggregateId;
      newLink[newLink.relativeIdType] = firstLink[newLink.relativeIdType];
      newLink[newLink.relativeNameType] = firstLink[newLink.relativeNameType];

      // TODO: In the future some links may not have a party field. Consider finding a way to
      // generalize this.
      newLink.party = firstLink.party;

      return newLink;
    }
  }
}
