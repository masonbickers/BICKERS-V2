const LOCATION_ALIAS_DEFINITIONS = Object.freeze({
  // Approved wording variants. Add aliases here only when they are known to
  // describe the same reporting location.
  "london area": { key: "london", label: "London" },
});

const cleanLocationLabel = (raw) =>
  String(raw ?? "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?!.,;:]+$/g, "")
    .trim();

export const normalizeLocationKey = (raw) =>
  cleanLocationLabel(raw)
    .toLocaleLowerCase("en-GB")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function canonicalizeLocation(raw) {
  const cleanedLabel = cleanLocationLabel(raw);
  const normalizedKey = normalizeLocationKey(cleanedLabel);

  if (!normalizedKey) return { key: "__missing__", label: "-", isAlias: false };

  const alias = LOCATION_ALIAS_DEFINITIONS[normalizedKey];
  if (alias) return { ...alias, isAlias: true };

  return { key: normalizedKey, label: cleanedLabel, isAlias: false };
}

export function buildCanonicalLocationRanking(bookings = [], limit = 8) {
  const groups = new Map();

  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const canonical = canonicalizeLocation(booking?.location);
    const current = groups.get(canonical.key) || {
      key: canonical.key,
      value: 0,
      bookingIds: new Set(),
      labelCounts: new Map(),
      canonicalLabel: "",
    };

    current.value += 1;
    if (booking?.id) current.bookingIds.add(booking.id);
    current.labelCounts.set(canonical.label, (current.labelCounts.get(canonical.label) || 0) + 1);
    if (canonical.isAlias) current.canonicalLabel = canonical.label;
    groups.set(canonical.key, current);
  }

  return [...groups.values()]
    .map((group) => {
      const mostCommonLabel = [...group.labelCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "-";

      return {
        key: group.key,
        label: group.canonicalLabel || mostCommonLabel,
        value: group.value,
        bookingIds: [...group.bookingIds],
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Number(limit) || 0));
}

