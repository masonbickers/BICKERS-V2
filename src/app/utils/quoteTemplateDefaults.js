const compact = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const STANDARD_OVERTIME_DESCRIPTION =
  "Overtime - 1.5x hourly rate: after 10 hours and for pre-call/call time before 07:00.";

const isStandardOvertimeLine = (description) =>
  /^overtime(?: charged)?(?: at)? 1 5(?:t|x hourly rate)/.test(compact(description));

const normalizeStandardQuoteWording = (item = {}) =>
  isStandardOvertimeLine(item.description)
    ? { ...item, description: STANDARD_OVERTIME_DESCRIPTION }
    : item;

export const sanitizeQuoteTemplateData = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeQuoteTemplateData(item));
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeQuoteTemplateData(item)])
    );
  }
  return value;
};

const sectionKind = (section) => {
  const normalized = compact(section);
  if (normalized.startsWith("equipment daily rates")) return "equipment";
  if (normalized.startsWith("labour rates")) return "labour";
  if (normalized === "travel charges") return "travel";
  return normalized;
};

const OFFICIAL_TRAVEL_PRICES = [
  { totalMode: "tbc", matches: (text) => /tracking vehicle and crew travel days/.test(text) },
  { totalMode: "tbc", matches: (text) => /tracking vehicle and crew travel time/.test(text) },
  { unitPrice: "22.00", totalMode: "tbc", matches: (text) => /travel meal allowance/.test(text) },
  { unitPrice: "TBC", totalMode: "production", matches: (text) => /hotel per (man|person)( per room)?$/.test(text) },
  { unitPrice: "35.00", totalMode: "tbc", matches: (text) => /overnight.*meal allowance|overnights meal allowance|^overnights?$|^overnight meal$/.test(text) },
  { unitPrice: "22.00", totalMode: "tbc", matches: (text) => /breakfast lunch not supplied/.test(text) },
  { totalMode: "tbc", matches: (text) => /recce travel time travel day|recce hours travel time/.test(text) },
  { unitPrice: "0.68", totalMode: "auto", matches: (text) => /recce mileage/.test(text) },
  { totalMode: "tbc", matches: (text) => /london and home counties fixed travel charge|^fixed travel charge$/.test(text) },
  { unitPrice: "30.00", totalMode: "tbc", matches: (text) => /london congestion (and )?ulez charge|london congestion charge ulez|^london congestion charge$|^congestion charge clean air zone charge where applicable$/.test(text) },
  { unitPrice: "TBC", totalMode: "tbc", matches: (text) => /^clean air zone charge/.test(text) },
];

const isCustomPrice = (item = {}) => Boolean(item.isCustomPrice || item.lockedSharedRate || item.usesSharedRate === false);

const normalizeOfficialTravelPrices = (template = {}) => ({
  ...template,
  lineItems: (template.lineItems || []).map((item) => {
    const description = compact(item.description);
    const isConfirmedGlcException =
      template.id === "q-glc-dynamic-tracking-vehicle-non-circuit-work-2026" &&
      ["680.00", "68.00", "102.00", "340.00"].includes(String(item.unitPrice ?? ""));
    if (isConfirmedGlcException) {
      return { ...item, isCustomPrice: true, lockedSharedRate: true, usesSharedRate: false };
    }
    if (sectionKind(item.section) !== "travel" || isCustomPrice(item)) return item;
    const official = OFFICIAL_TRAVEL_PRICES.find((rule) => rule.matches(description));
    return official
      ? {
          ...item,
          ...(official.unitPrice !== undefined ? { unitPrice: official.unitPrice } : {}),
          totalMode: official.totalMode,
        }
      : item;
  }),
});

export const STANDARD_TRAVEL_CHARGES = Object.freeze([
  { key: "crew-travel-days", description: "Tracking Vehicle and Crew Travel Days", unitPrice: "585.00", totalMode: "tbc", matches: (text) => /crew travel days/.test(text) },
  { key: "crew-travel-time", description: "Tracking Vehicle and Crew Travel Time", unitPrice: "58.50", totalMode: "tbc", matches: (text) => /crew travel time|crew and vehicle travel time/.test(text) },
  { key: "fixed-travel", description: "London and Home Counties Fixed Travel Charge", unitPrice: "185.00", totalMode: "tbc", matches: (text) => /fixed travel charge/.test(text) },
  { key: "congestion-ulez", description: "London Congestion and ULEZ Charge per Vehicle", unitPrice: "30.00", totalMode: "tbc", matches: (text) => /congestion|ulez/.test(text) },
  { key: "clean-air", description: "Clean Air Zone Charge Where Applicable", unitPrice: "TBC", totalMode: "tbc", matches: (text) => /^clean air zone/.test(text) },
  { key: "travel-meal", description: "Travel Meal Allowance per Person per Day", unitPrice: "22.00", totalMode: "tbc", matches: (text) => /travel meal allowance/.test(text) },
  { key: "hotel-room", description: "Hotel per Person per Room", unitPrice: "TBC", totalMode: "production", matches: (text) => /hotel per (man|person)/.test(text) },
  { key: "overnight-meal", description: "Overnight Meal Allowance per Person per Night", unitPrice: "35.00", totalMode: "tbc", matches: (text) => /overnight meal|overnights|^overnight$/.test(text) },
  { key: "breakfast-lunch", description: "Breakfast/Lunch Not Supplied on Location per Person", unitPrice: "22.00", totalMode: "tbc", matches: (text) => /breakfast lunch/.test(text) },
  { key: "recce-travel", description: "Recce Travel Time/Travel Day Outside London", unitPrice: "58.50", totalMode: "tbc", matches: (text) => /recce (travel time|travel day|hours travel time)/.test(text) },
  { key: "recce-mileage", description: "Recce Mileage", unitPrice: "0.68", totalMode: "tbc", matches: (text) => /recce mileage/.test(text) },
]);

export const ensureStandardTravelCharges = (template = {}) => {
  const lineItems = Array.isArray(template.lineItems)
    ? template.lineItems.map((item) => normalizeStandardQuoteWording({ ...item }))
    : [];
  const travelDescriptions = lineItems
    .filter((item) => sectionKind(item.section) === "travel")
    .map((item) => compact(item.description));

  STANDARD_TRAVEL_CHARGES.forEach((charge) => {
    if (travelDescriptions.some(charge.matches)) return;
    lineItems.push({
      section: "Travel Charges",
      description: charge.description,
      qty: "",
      unitPrice: charge.unitPrice,
      totalMode: charge.totalMode,
      standardTravelCharge: charge.key,
    });
  });

  return normalizeOfficialTravelPrices({ ...template, lineItems });
};

const descriptionKind = (description) => {
  const normalized = compact(description);
  if (isStandardOvertimeLine(description)) {
    return "overtime 1 5 hourly rate";
  }
  if (normalized === "to services of driver technician per") {
    return "to services of driver technician per 10hr cont day call to wrap";
  }
  if (normalized === "to services of driver technician per 9hr day 10hrs inc 1hr lunch") {
    return "glc driver technician 9hr working day plus 1hr lunch";
  }
  if (normalized === "glc crew and vehicle travel time") {
    return "tracking vehicle and crew travel time";
  }
  return normalized;
};

const lineKey = (item = {}) => `${sectionKind(item.section)}::${descriptionKind(item.description)}`;

const isProtectedCustomLine = (item = {}) =>
  !item.sourceRow ||
  item.totalMode === "discount" ||
  Boolean(item.isCustomPrice || item.lockedSharedRate || item.usesSharedRate);

const cloneTemplate = (template = {}) => ensureStandardTravelCharges(template);

const mergeLine = (sourceLine, savedLine) => {
  if (!savedLine) return { ...sourceLine };
  const preserveSavedMode = Boolean(
    savedLine.isCustomPrice || savedLine.lockedSharedRate || savedLine.usesSharedRate
  );
  return {
    ...sourceLine,
    ...savedLine,
    section: sourceLine.section,
    description: sourceLine.description,
    qty: sourceLine.qty,
    unitPrice:
      savedLine.unitPrice === undefined || savedLine.unitPrice === null || savedLine.unitPrice === ""
        ? sourceLine.unitPrice
        : savedLine.unitPrice,
    totalMode: preserveSavedMode ? savedLine.totalMode || sourceLine.totalMode : sourceLine.totalMode,
    sourceRow: sourceLine.sourceRow,
  };
};

const mergeTemplate = (sourceTemplate, savedTemplate) => {
  const savedLines = Array.isArray(savedTemplate?.lineItems) ? savedTemplate.lineItems : [];
  const savedByKey = new Map(savedLines.map((item) => [lineKey(item), item]));
  const sourceKeys = new Set((sourceTemplate.lineItems || []).map(lineKey));
  const isLegacyTowPoleTemplate = sourceTemplate.id === "q-trojan-electric-and-motorcycle-banking-rig-or-mini-low-loader-2026";

  const lineItems = (sourceTemplate.lineItems || []).map((item) => mergeLine(item, savedByKey.get(lineKey(item))));
  savedLines.forEach((item) => {
    if (sourceKeys.has(lineKey(item))) return;
    if (isLegacyTowPoleTemplate && !isProtectedCustomLine(item)) return;
    lineItems.push({ ...item });
  });

  return {
    ...sourceTemplate,
    ...savedTemplate,
    id: sourceTemplate.id,
    file: isLegacyTowPoleTemplate ? sourceTemplate.file : savedTemplate.file || sourceTemplate.file,
    serviceDescription: isLegacyTowPoleTemplate
      ? sourceTemplate.serviceDescription
      : savedTemplate.serviceDescription || sourceTemplate.serviceDescription,
    lineItems,
  };
};

export function mergeQuoteTemplatesWithDefaults(savedTemplates = [], sourceTemplates = []) {
  if (!Array.isArray(sourceTemplates) || !sourceTemplates.length) {
    return Array.isArray(savedTemplates) ? savedTemplates.map(cloneTemplate) : [];
  }

  const saved = Array.isArray(savedTemplates) ? savedTemplates : [];
  const savedById = new Map(saved.filter((template) => template?.id).map((template) => [template.id, template]));
  const standardizedSources = sourceTemplates.map(ensureStandardTravelCharges);
  const sourceIds = new Set(standardizedSources.map((template) => template.id));
  const merged = standardizedSources.map((sourceTemplate) => {
    const savedTemplate = savedById.get(sourceTemplate.id);
    return savedTemplate ? mergeTemplate(sourceTemplate, savedTemplate) : cloneTemplate(sourceTemplate);
  });

  saved.forEach((template) => {
    if (!sourceIds.has(template?.id)) merged.push(cloneTemplate(template));
  });
  return merged.map(normalizeOfficialTravelPrices);
}
