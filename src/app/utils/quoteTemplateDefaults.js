const compact = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sectionKind = (section) => {
  const normalized = compact(section);
  if (normalized.startsWith("equipment daily rates")) return "equipment";
  if (normalized.startsWith("labour rates")) return "labour";
  if (normalized === "travel charges") return "travel";
  return normalized;
};

const lineKey = (item = {}) => `${sectionKind(item.section)}::${compact(item.description)}`;

const isProtectedCustomLine = (item = {}) =>
  !item.sourceRow ||
  item.totalMode === "discount" ||
  Boolean(item.isCustomPrice || item.lockedSharedRate || item.usesSharedRate);

const cloneTemplate = (template = {}) => ({
  ...template,
  lineItems: Array.isArray(template.lineItems) ? template.lineItems.map((item) => ({ ...item })) : [],
});

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
  const sourceIds = new Set(sourceTemplates.map((template) => template.id));
  const merged = sourceTemplates.map((sourceTemplate) => {
    const savedTemplate = savedById.get(sourceTemplate.id);
    return savedTemplate ? mergeTemplate(sourceTemplate, savedTemplate) : cloneTemplate(sourceTemplate);
  });

  saved.forEach((template) => {
    if (!sourceIds.has(template?.id)) merged.push(cloneTemplate(template));
  });
  return merged;
}
