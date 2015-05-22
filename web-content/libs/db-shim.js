
var initLinksPerRelative = 5;
var newLinksPerExpansion = 5;

function getSelfProperties(selfType) {
  var childType = selfType;
  var relativeType = (selfType == "source") ? "target" : "source";
  return {
    "selfType": selfType,
    "selfIdType": selfType + "id",
    "selfNameType": selfType + "name",
    "childType": childType,
    "childIdType": childType + "id",
    "childNameType": childType + "name",
    "relativeType": relativeType,
    "relativeIdType": relativeType + "id",
    "relativeNameType": relativeType + "name"
  };
}

function processRows(rows, seedIds) {
  console.log("Got " + rows.length + " raw links ");

  var links = [];
  var linkExistenceMap = {};
  var linksToAggregate = { "source": [], "target": [] };
  var aggregateLinks = {};
  var linkCounts = {};

  rows.forEach(
      function(row) {
        row.isRefund = row.amount < 0;

        row.id = row.sourceid + "; " + row.targetid + "; "
            + row.directorindirect + "; " + row.isagainst;

        // TODO: The use of both source and target aggregation in the same graph is problematic.
        // Aggregate expansion becomes more complicated when expanding a source aggregate link could
        // invalidate an existing target aggregate link's displayed amount and sub link count.
        // I.e., if the expansion reveals a link between the two nodes that was there all along but
        // that was hidden under both aggregate links, then both aggregate links will need to be
        // updated (not just the one that the user chose to expand). We can skirt around this
        // problem for now by enforcing that links between seed nodes can never be aggregated;
        // however, this problem may rear its ugly head again as the graphs become more complex and
        // dynamic over time.
        if (row.seedtarget) {
          handleRowSelfType(row, "source", !row.seedsource);
        }
        if (row.seedsource) {
          handleRowSelfType(row, "target", !row.seedtarget);
        }
      });

  // Aggregate the outstanding links in reverse order, to ensure that the ones with the highest
  // amounts will be displayed first if the user chooses to expand them.
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

  function getNodeAndLinkTypeId(row, relativeId) {
    return "key " + relativeId + "; " + row.sourcetype + "; "
        + row.directorindirect + "; " + row.isagainst;
  }

  // TODO: Consider merging the logic above that calls this method 0, 1, or 2 times into the method
  // itself.
  function handleRowSelfType(row, selfType, isAggregable) {
    var properties = getSelfProperties(selfType);

    var relativeAndLinkTypeId = getNodeAndLinkTypeId(row, row[properties.relativeIdType]);
    var numLinks = linkCounts[relativeAndLinkTypeId] || (linkCounts[relativeAndLinkTypeId] = 0);

    // TODO: Given the various conditions that can trigger a new non-aggregate link, it's likely
    // that we'll often exceed initLinksPerRelative. Maybe we should do something about this. For
    // example, maybe we could only add non aggregable links up to iniLinksPerRelative first, and
    // then only consider aggregable ones if we haven't reached our limit.
    if (!isAggregable
        || numLinks < initLinksPerRelative
        || linkExistenceMap[row[properties.childIdType] + ", " + row[properties.relativeIdType]]) {
      // TODO: Storing this extra state as a boolean field is kind of hacky. Find a better way.
      if (!row.isAddedToLinks) {
        links.push(row);
        row.isAddedToLinks = true;
      }
      linkCounts[relativeAndLinkTypeId] = numLinks + 1;  // TODO: Use ++ operator?
      // TODO: Uncomment this now that there's a better way to render multiple links between the
      // same two nodes.
      //
      //linkExistenceMap[row[properties.childIdType] + ", " + row[properties.relativeIdType]] =
      //    true;
    } else {
      // We have enough links for the relative node to display already. We'll aggregate the
      // remaining links later.
      linksToAggregate[selfType].push(row);
    }
  }

  function aggregateRow(row, aggregateType) {
    // TODO: Try to avoid calculating all properties here, since we only need relativeIdType.
    var properties = getSelfProperties(aggregateType);
    var aggreagateNodeId = getNodeAndLinkTypeId(row, row[properties.relativeIdType]);

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
      aggregateLink.seedsource |= row.seedsource;
      aggregateLink.seedtarget |= row.seedtarget;
      // TODO: Verify that sourcetype is the same.
      //
      // TODO: In the future some links may not have a party field. Consider finding a way to
      // generalize this.
      if (row.party != aggregateLink.party) {
        aggregateLink.party = null;
      }
    } else {
      aggregateLinks[aggreagateNodeId] =
          newAggregateLink(aggreagateNodeId, aggregateType, row, row.isagainst);
    }

    function newAggregateLink(aggregateLinkId, aggregateType, firstLink, isagainst) {
      var newCount = firstLink.count || 1;

      var newLink = getSelfProperties(aggregateType);
      newLink.id = aggregateLinkId;
      newLink.amount = firstLink.amount;
      newLink.count = newCount;
      newLink.directorindirect = firstLink.directorindirect;
      newLink.isagainst = isagainst;
      newLink.isRefund = firstLink.amount < 0 ? true : false;
      newLink.subLinks = [ firstLink ];
      newLink.seedsource = firstLink.seedsource;
      newLink.seedtarget = firstLink.seedtarget;
      newLink.sourcetype = firstLink.sourcetype;

      // It's up to the caller to set newLink[newLink.childNameType], since that's a pretty-printed
      // string whose format depends on the application-specific rendering of aggregate nodes.
      newLink[newLink.childIdType] = aggregateLinkId;
      newLink[newLink.relativeIdType] = firstLink[newLink.relativeIdType];
      newLink[newLink.relativeNameType] = firstLink[newLink.relativeNameType];

      // TODO: In the future some links may not have a party field. Consider finding a way to
      // generalize this.
      newLink.party = firstLink.party;

      return newLink;
    }
  }
}
