const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizePrice = (value) => {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw.replace(/[^\d.-]/g, ""));
  return raw && Number.isFinite(numeric) ? numeric.toFixed(2) : raw.toUpperCase();
};

export const isPrimaryVehicleCostSection = (section = "") =>
  normalizeText(section).includes("equipment");

export const summarizeQuoteTemplateVehicleCosts = (templates = []) => {
  const entries = templates.flatMap((template) => {
    const lineItems = Array.isArray(template?.lineItems) ? template.lineItems : [];
    const itemIndex = lineItems.findIndex((item) =>
      isPrimaryVehicleCostSection(item?.section) && String(item?.description || "").trim()
    );
    if (itemIndex < 0) return [];

    const item = lineItems[itemIndex];
    const vehicleName = String(item.description || "").trim();
    return [{
      templateId: String(template.id || ""),
      templateName: String(template.serviceDescription || template.file || template.id || "Unnamed template"),
      itemIndex,
      vehicleName,
      vehicleKey: normalizeText(vehicleName),
      unitPrice: String(item.unitPrice ?? "").trim(),
      priceKey: normalizePrice(item.unitPrice),
      totalMode: String(item.totalMode || "auto"),
    }];
  });

  const byVehicle = new Map();
  const byPrice = new Map();
  entries.forEach((entry) => {
    if (!byVehicle.has(entry.vehicleKey)) byVehicle.set(entry.vehicleKey, []);
    byVehicle.get(entry.vehicleKey).push(entry);
    if (entry.priceKey) {
      if (!byPrice.has(entry.priceKey)) byPrice.set(entry.priceKey, []);
      byPrice.get(entry.priceKey).push(entry);
    }
  });

  const comparedEntries = entries.map((entry) => {
    const vehicleMatches = byVehicle.get(entry.vehicleKey) || [];
    const priceMatches = entry.priceKey ? byPrice.get(entry.priceKey) || [] : [];
    const vehiclePrices = new Set(vehicleMatches.map((match) => match.priceKey).filter(Boolean));
    const costVehicleCount = new Set(priceMatches.map((match) => match.vehicleKey)).size;
    return {
      ...entry,
      vehicleTemplateCount: new Set(vehicleMatches.map((match) => match.templateId)).size,
      hasVehiclePriceDifference: vehiclePrices.size > 1,
      costVehicleCount,
      sharesCostWithOtherVehicles: costVehicleCount > 1,
    };
  }).sort((a, b) =>
    a.vehicleName.localeCompare(b.vehicleName) || a.templateName.localeCompare(b.templateName)
  );

  const priceGroups = Array.from(comparedEntries.reduce((groups, entry) => {
    const key = entry.priceKey || "__unset__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
    return groups;
  }, new Map()).entries()).map(([priceKey, matches]) => {
    const vehicles = Array.from(matches.reduce((groups, entry) => {
      if (!groups.has(entry.vehicleKey)) groups.set(entry.vehicleKey, []);
      groups.get(entry.vehicleKey).push(entry);
      return groups;
    }, new Map()).values()).map((vehicleEntries) => ({
      vehicleKey: vehicleEntries[0].vehicleKey,
      vehicleName: vehicleEntries[0].vehicleName,
      hasVehiclePriceDifference: vehicleEntries.some((entry) => entry.hasVehiclePriceDifference),
      templates: vehicleEntries.map((entry) => ({
        templateId: entry.templateId,
        templateName: entry.templateName,
        itemIndex: entry.itemIndex,
      })),
    })).sort((a, b) => a.vehicleName.localeCompare(b.vehicleName));

    return {
      priceKey,
      unitPrice: matches[0].unitPrice,
      vehicleCount: vehicles.length,
      templateCount: new Set(matches.map((entry) => entry.templateId)).size,
      hasVehiclePriceDifference: matches.some((entry) => entry.hasVehiclePriceDifference),
      vehicles,
    };
  }).sort((a, b) => {
    const aPrice = Number(a.priceKey);
    const bPrice = Number(b.priceKey);
    if (Number.isFinite(aPrice) && Number.isFinite(bPrice)) return bPrice - aPrice;
    if (Number.isFinite(aPrice)) return -1;
    if (Number.isFinite(bPrice)) return 1;
    return a.priceKey.localeCompare(b.priceKey);
  });

  return {
    entries: comparedEntries,
    priceGroups,
    templateCount: entries.length,
    uniqueVehicleCount: byVehicle.size,
    sharedCostCount: priceGroups.filter((group) => group.vehicleCount > 1).length,
    varianceVehicleCount: Array.from(byVehicle.values()).filter((matches) =>
      new Set(matches.map((match) => match.priceKey).filter(Boolean)).size > 1
    ).length,
  };
};
