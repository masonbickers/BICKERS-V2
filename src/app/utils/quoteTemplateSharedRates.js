export const SHARED_RATE_RULES = [
  { id: "five_k_generator", group: "equipment", label: "5K Generator", match: /5k generator/ },
  { id: "basic_riggers", group: "equipment", label: "Basic Riggers Scaffolding Kit", match: /basic riggers scaffolding kit/ },
  { id: "pre_rigging", group: "equipment", label: "Pre-Rigging & Additional Equipment", match: /pre rigging.*(additional equipment|prep|prep work)|pre rigging and prep work charged/ },
  { id: "driver_day", group: "labour", label: "Driver/Technician per 10hr day", match: /services? of driver.*technician.*10hr/ },
  {
    id: "overtime_1_5",
    group: "labour",
    label: "Overtime - 1.5x hourly rate",
    canonicalDescription: "Overtime - 1.5x hourly rate: after 10 hours and for pre-call/call time before 07:00.",
    match: /^overtime(?: charged)?(?: at)? 1 5(?:t|x hourly rate)/,
  },
  { id: "sunday_bank_holiday", group: "labour", label: "Sunday and Bank Holiday double time", match: /sunday.*bank holiday.*double time|double time.*sundays.*bank holidays/ },
  { id: "turnaround", group: "labour", label: "Turnaround Day After Night Work", match: /turnaround day after night work/ },
  { id: "late_working", group: "labour", label: "Late working 22:00-23:59", match: /supplementary charge for late working/ },
  { id: "saturday", group: "labour", label: "Saturday working supplement", match: /supplementary charge applies for saturday working/ },
  { id: "commercials_weekend_night", group: "labour", label: "Commercials weekend/night APA", match: /commercials.*(sundays|night work).*(saturday|saturdays).*1 5t/ },
  { id: "recce_charge", group: "labour", label: "Recce charge per man", match: /recce charge per man/ },
  { id: "tracking_travel_days", group: "travel", label: "Tracking vehicle and crew travel days", officialTotalMode: "tbc", match: /tracking vehicle and crew travel days/ },
  { id: "tracking_travel_time", group: "travel", label: "Tracking vehicle and crew travel time", officialTotalMode: "tbc", match: /tracking vehicle and crew travel time/ },
  { id: "travel_meal", group: "travel", label: "Travel Meal Allowance", officialUnitPrice: "22.00", officialTotalMode: "tbc", match: /travel meal allowance/ },
  { id: "hotel_room", group: "travel", label: "Hotel per person/room", officialUnitPrice: "TBC", officialTotalMode: "production", match: /hotel per (?:man|person)(?: per room)?$/ },
  { id: "overnight_meal", group: "travel", label: "Overnight Meal Allowance", officialUnitPrice: "35.00", officialTotalMode: "tbc", match: /overnight.*meal allowance|overnights meal allowance|^overnights?$|^overnight meal$/ },
  { id: "breakfast_lunch", group: "travel", label: "Breakfast/Lunch not supplied", officialUnitPrice: "22.00", officialTotalMode: "tbc", match: /breakfast lunch not supplied on location per man/ },
  { id: "recce_travel_time", group: "travel", label: "Recce travel time/day", officialTotalMode: "tbc", match: /recce travel time travel day|recce hours travel time/ },
  { id: "recce_mileage", group: "travel", label: "Recce mileage", officialUnitPrice: "0.68", officialTotalMode: "auto", match: /recce mileage/ },
  { id: "london_home_counties", group: "travel", label: "London/Home Counties fixed travel", officialTotalMode: "tbc", match: /london and home counties fixed travel charge|^fixed travel charge$/ },
  { id: "congestion_ulez", group: "travel", label: "London Congestion/ULEZ", officialUnitPrice: "30.00", officialTotalMode: "tbc", match: /london congestion (?:and )?ulez charge|london congestion charge ulez|^london congestion charge$|^congestion charge clean air zone charge where applicable$/ },
  { id: "clean_air", group: "travel", label: "Clean air zone charge", officialUnitPrice: "TBC", officialTotalMode: "tbc", match: /^clean air zone charge/ },
];

export const SHARED_RATE_GROUPS = [
  { id: "equipment", label: "Equipment - Daily Rates" },
  { id: "labour", label: "Labour Rates - Daily Rates" },
  { id: "travel", label: "Travel Charges" },
];

export const normalizeSharedRateText = (value) =>
  String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

export const findSharedRateRuleForItem = (item = {}) => {
  const sharedRateId = String(item.sharedRateId || "").trim();
  if (sharedRateId) {
    const byId = SHARED_RATE_RULES.find((rule) => rule.id === sharedRateId);
    if (byId) return byId;
  }
  const description = normalizeSharedRateText(item.description);
  return SHARED_RATE_RULES.find((rule) => rule.match.test(description)) || null;
};

export const itemMatchesSharedRateRule = (item = {}, rule) =>
  Boolean(rule) && (String(item.sharedRateId || "").trim() === rule.id || rule.match.test(normalizeSharedRateText(item.description)));

export const isCustomSharedRateLine = (item = {}) => Boolean(item.isCustomPrice || item.lockedSharedRate || item.usesSharedRate === false);

export const isSharedRateLinkedLine = (item = {}) =>
  !isCustomSharedRateLine(item) && Boolean(findSharedRateRuleForItem(item));

export const sharedRateLineStatus = (item = {}, templateExcluded = false) => {
  if (templateExcluded) return { id: "excluded", label: "Template Excluded" };
  if (isCustomSharedRateLine(item)) return { id: "custom", label: "Custom Price" };
  if (isSharedRateLinkedLine(item)) return { id: "shared", label: "Shared Rate" };
  return { id: "template", label: "Template Only" };
};

const countValues = (values) => values.reduce((map, value) => {
  const key = String(value ?? "");
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map());

const mostCommonValue = (values, fallback = "") =>
  Array.from(countValues(values).entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;

const formatValueCounts = (values) =>
  Array.from(countValues(values).entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => `${value || "blank"} (${count})`)
    .join(", ");

export const summarizeSharedRates = (templates = []) => SHARED_RATE_RULES.map((rule) => {
  const matches = [];
  templates.forEach((template) => {
    (template.lineItems || []).forEach((item, itemIndex) => {
      if (!itemMatchesSharedRateRule(item, rule)) return;
      const templateExcluded = Boolean(template.excludeFromSharedRates);
      const lineLocked = isCustomSharedRateLine(item);
      matches.push({
        templateId: template.id,
        templateName: template.serviceDescription || template.file || template.id,
        templateExcluded,
        lineLocked,
        willUpdate: !templateExcluded && !lineLocked,
        itemIndex,
        description: item.description || "",
        unitPrice: String(item.unitPrice ?? ""),
        totalMode: String(item.totalMode || "auto"),
      });
    });
  });
  const updateMatches = matches.filter((match) => match.willUpdate);
  const excludedMatches = matches.filter((match) => match.templateExcluded);
  const lockedMatches = matches.filter((match) => !match.templateExcluded && match.lineLocked);
  const comparableMatches = updateMatches.length ? updateMatches : matches;
  const units = comparableMatches.map((match) => match.unitPrice);
  const modes = comparableMatches.map((match) => match.totalMode);
  const unitPrices = Array.from(new Set(units));
  const totalModes = Array.from(new Set(modes));
  return {
    ...rule,
    matches,
    updateMatches,
    excludedMatches,
    lockedMatches,
    occurrenceCount: matches.length,
    templateCount: new Set(matches.map((match) => match.templateId)).size,
    updateLineCount: updateMatches.length,
    updateTemplateCount: new Set(updateMatches.map((match) => match.templateId)).size,
    excludedTemplateCount: new Set(excludedMatches.map((match) => match.templateId)).size,
    lockedLineCount: lockedMatches.length,
    unitPrices,
    totalModes,
    suggestedUnitPrice: rule.officialUnitPrice ?? mostCommonValue(units),
    suggestedTotalMode: rule.officialTotalMode ?? mostCommonValue(modes, "tbc"),
    unitPriceSummary: formatValueCounts(units),
    totalModeSummary: formatValueCounts(modes),
    hasVariance:
      unitPrices.length > 1 ||
      totalModes.length > 1 ||
      (rule.officialUnitPrice !== undefined && updateMatches.some((match) => match.unitPrice !== rule.officialUnitPrice)) ||
      (rule.officialTotalMode !== undefined && updateMatches.some((match) => match.totalMode !== rule.officialTotalMode)),
  };
}).filter((summary) => summary.occurrenceCount);

export const normalizeSharedRatePrice = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { valid: true, value: "" };
  if (raw.toUpperCase() === "TBC") return { valid: true, value: "TBC" };
  if (!/^\d+(?:\.\d{0,2})?$/.test(raw)) return { valid: false, value: raw, error: "Enter a non-negative price, blank, or TBC." };
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return { valid: false, value: raw, error: "Enter a non-negative price, blank, or TBC." };
  return { valid: true, value: number.toFixed(2) };
};

export const applySharedRateToTemplates = (templates = [], rule, { unitPrice, totalMode }) =>
  templates.map((template) => ({
    ...template,
    lineItems: (template.lineItems || []).map((item) =>
      !template.excludeFromSharedRates && !isCustomSharedRateLine(item) && itemMatchesSharedRateRule(item, rule)
        ? {
            ...item,
            ...(rule.canonicalDescription ? { description: rule.canonicalDescription } : {}),
            sharedRateId: rule.id,
            usesSharedRate: true,
            isCustomPrice: false,
            lockedSharedRate: false,
            unitPrice,
            totalMode,
          }
        : item
    ),
  }));

export const nextQuoteTemplateRevision = (expectedRevision, currentRevision) => {
  const expected = Number(expectedRevision) || 0;
  const current = Number(currentRevision) || 0;
  if (expected !== current) {
    const conflict = new Error("Another administrator updated Quote Templates after this page loaded.");
    conflict.code = "quote-template-conflict";
    throw conflict;
  }
  return current + 1;
};
