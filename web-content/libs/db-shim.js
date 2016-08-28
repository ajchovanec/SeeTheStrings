var initLinksPerRelative = 3;
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

function processRows(rows, seedIds, setRowLinkProperties) {
  console.log("Got " + rows.length + " raw links ");

  var links = [];
  var linkExistenceMap = {};
  var rowsToMaybeAggregateBySelfType = { "source": [], "target": [] };
  var rowsToAggregateBySelfType = { "source": [], "target": [] };
  var aggregateLinks = {};
  var linkCounts = {};

  // We do multiple passes over the rows to decide which ones to aggregate. First we identify sets
  // of rows for which we might do source and target aggregation, respectively. We will definitely
  // display links for any rows not in these sets. Then we do a second pass over these sets, and we
  // opt to display a link rather than to aggregate for any row whose nodes are also connected by
  // another link that we already plan to display.
  //
  // TODO: Perhaps the criterion for displaying a link that would otherwise be aggregated should
  // simply be that both of its nodes will already be displayed, rather than the stricter
  // requirement that there must be an already existing displayable link between them.

  // First pass. Identify links that we might aggregate.
  rows.forEach(handleRow.bind(undefined, rowsToMaybeAggregateBySelfType));

  // Second pass. Possibly aggregated rows are already split up by aggregate type.
  rowsToMaybeAggregateBySelfType["source"]
      .forEach(handleRowSelfType.bind(
          undefined, "source", rowsToAggregateBySelfType["source"]));
  rowsToMaybeAggregateBySelfType["target"]
      .forEach(handleRowSelfType.bind(
          undefined, "target", rowsToAggregateBySelfType["target"]));

  function handleRow(rejectedRowsByType, row) {
    // TODO: Move these assignments into setRowLinkProperties().
    row.id = row.sourceid + "; " + row.targetid + "; "
        + row.directorindirect + "; " + row.isagainst;

    setRowLinkProperties(row);

    // TODO: The use of both source and target aggregation in the same graph is problematic.
    // Aggregate expansion becomes more complicated when expanding a source aggregate link could
    // invalidate an existing target aggregate link's displayed amount and sub link count.
    // I.e., if the expansion reveals a link between the two nodes that was there all along but
    // that was hidden under both aggregate links, then both aggregate links will need to be
    // updated (not just the one that the user chose to expand). We can skirt around this
    // problem for now by enforcing that links between seed nodes can never be aggregated;
    // however, this problem may rear its ugly head again as the graphs become more complex and
    // dynamic over time.
    //
    // TODO: There may be a bug here where the same link can be both displayed by itself and as
    // part of an aggregate.
    if (row.seedtarget) {
      handleRowSelfType("source", rejectedRowsByType["source"], row);
    }
    if (row.seedsource) {
      handleRowSelfType("target", rejectedRowsByType["target"], row);
    }
  }

  // Aggregate the outstanding links in reverse order, to ensure that the ones with the highest
  // amounts will be displayed first if the user chooses to expand them.
  for (var aggregateType in rowsToAggregateBySelfType) {
    for (var i = rowsToAggregateBySelfType[aggregateType].length - 1; i >= 0; --i) {
      aggregateRow(rowsToAggregateBySelfType[aggregateType][i], aggregateType);
    }
  }
  for (var contributionKey in aggregateLinks) {
    links.push(aggregateLinks[contributionKey]);
    console.log("Adding aggregate link with key: " + contributionKey);
  }
  return links;

  function getNodeAndLinkTypeId(row, relativeId) {
    return "key " + relativeId + "; " + row.sourcetype + "; " + row.targettype + "; "
        + row.directorindirect + "; " + row.isagainst;
  }

  // TODO: Consider merging the logic above that calls this method multiple times into the method
  // itself.
  // TODO: Also, try to improve decoupling by not using variables declared outside of this method.
  function handleRowSelfType(selfType, rejectedRows, row) {
    var properties = getSelfProperties(selfType);

    var isAggregable = !row["seed" + selfType];  // FIXME

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
      // By setting the value in the link existence map to true, we may cause additional links
      // between the same two nodes that would otherwise be aggregated to be displayed.
      linkExistenceMap[row[properties.childIdType] + ", " + row[properties.relativeIdType]] = true;
    } else {
      // We have enough links for the relative node to display already. Reject this one.
      rejectedRows.push(row);
    }
  }

  function mergeRowPropertiesIntoLink(fromRow, intoLink, aggregateType) {
    intoLink.seedsource |= fromRow.seedsource;
    intoLink.seedtarget |= fromRow.seedtarget;
    intoLink[aggregateType + "count"] += (fromRow[aggregateType + "count"] || 1);
    // TODO: Verify that sourcetype is the same.

    // If the properties in the existing aggregate link that we are merging into no longer apply
    // to the transitive closure of its sub links after the merge, then unset them at the aggregate
    // level.
    //
    // TODO: Try to find a way to do this more concisely.
    for (var propertyKey in fromRow.linkClassProperties) {
      if (intoLink.linkClassProperties[propertyKey] != undefined
          && intoLink.linkClassProperties[propertyKey]
              != fromRow.linkClassProperties[propertyKey]) {
        if (propertyKey == "amount") {
          // TODO: Get rid of this special handling for merging amounts, possibly by having the
          // caller of processRows pass in a function with application specific logic for merging
          // amounts.
          intoLink.linkClassProperties.amount += fromRow.amount;
        } else {
          intoLink.linkClassProperties[propertyKey] = undefined;
        }
      }
    }
    for (var propertyKey in fromRow.sourceClassProperties) {
      if (intoLink.sourceClassProperties[propertyKey] != undefined
          && intoLink.sourceClassProperties[propertyKey]
              != fromRow.sourceClassProperties[propertyKey]) {
        intoLink.sourceClassProperties[propertyKey] = undefined;
      }
    }
    for (var propertyKey in fromRow.targetClassProperties) {
      if (intoLink.targetClassProperties[propertyKey] != undefined
          && intoLink.targetClassProperties[propertyKey]
              != fromRow.targetClassProperties[propertyKey]) {
        intoLink.targetClassProperties[propertyKey] = undefined;
      }
    }
  }

  function aggregateRow(row, aggregateType) {
    // TODO: Try to avoid calculating all properties here, since we only need relativeIdType.
    var properties = getSelfProperties(aggregateType);
    var aggreagateNodeId = getNodeAndLinkTypeId(row, row[properties.relativeIdType]);

    var existingAggregateLink = aggregateLinks[aggreagateNodeId];
    if (existingAggregateLink) {
      if (existingAggregateLink.subLinks.length > newLinksPerExpansion) {
        aggregateLinks[aggreagateNodeId] =
            newAggregateLink(aggreagateNodeId, aggregateType, existingAggregateLink, row.isagainst);
      }
      var aggregateLink = aggregateLinks[aggreagateNodeId];
      if (row[aggregateType + "aggregate"]) {
        if (aggregateLink.subLinks.length > 0
            && aggregateLink.subLinks[0][aggregateType + "aggregate"]) {
          // If the new row is an aggregate, and if the existing aggregate link already contains a
          // nested aggregate link, then merge the new row into that aggregate instead of adding it
          // as its own link.
          //
          // TODO: Make sure we don't end up with an aggregate link which just contains another
          // aggregate link.
          mergeRowPropertiesIntoLink(row, aggregateLink.subLinks[0], aggregateType);
        } else {
          // Always list aggregate links first so we know where to find them.
          aggregateLink.subLinks.splice(0, 0, row);
        }
      } else {
        aggregateLink.subLinks.push(row);
      }
      mergeRowPropertiesIntoLink(row, aggregateLink, aggregateType);
    } else {
      aggregateLinks[aggreagateNodeId] =
          newAggregateLink(aggreagateNodeId, aggregateType, row, row.isagainst);
    }

    function newAggregateLink(aggregateLinkId, aggregateType, firstLink, isagainst) {
      var newCount = firstLink[aggregateType + "count"] || 1;

      var newLink = getSelfProperties(aggregateType);
      newLink.id = aggregateLinkId;
      newLink.subLinks = [ firstLink ];
      newLink.seedsource = firstLink.seedsource;
      newLink.seedtarget = firstLink.seedtarget;
      newLink.sourcetype = firstLink.sourcetype;
      newLink.targettype = firstLink.targettype;
      newLink[aggregateType + "aggregate"] = true;
      newLink[aggregateType + "count"] = newCount;

      // It's up to the caller to set newLink[newLink.childNameType], since that's a pretty-printed
      // string whose format depends on the application-specific rendering of aggregate nodes.
      newLink[newLink.childIdType] = aggregateLinkId;
      newLink[newLink.relativeIdType] = firstLink[newLink.relativeIdType];
      newLink[newLink.relativeNameType] = firstLink[newLink.relativeNameType];

      // Copy the source and target node properties over to the new aggregate link.
      //
      // TODO: Try to do this more concisely, possibly by using _.clone().
      newLink.linkClassProperties = {};
      newLink.sourceClassProperties = {};
      newLink.targetClassProperties = {};
      for (var propertyKey in firstLink.linkClassProperties) {
        newLink.linkClassProperties[propertyKey] = firstLink.linkClassProperties[propertyKey];
      }
      for (var propertyKey in firstLink.sourceClassProperties) {
        newLink.sourceClassProperties[propertyKey] = firstLink.sourceClassProperties[propertyKey];
      }
      for (var propertyKey in firstLink.targetClassProperties) {
        newLink.targetClassProperties[propertyKey] = firstLink.targetClassProperties[propertyKey];
      }

      console.log("New aggregate link has amount " + newLink.linkClassProperties.amount);

      return newLink;
    }
  }
}
