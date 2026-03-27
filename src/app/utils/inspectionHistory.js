export function toIsoDateString(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") {
    return toIsoDateString(value.toDate());
  }
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function mergeMaintenanceHistory(existing = [], entry = null) {
  if (!entry || !entry.completedDate) return Array.isArray(existing) ? existing : [];

  const base = Array.isArray(existing) ? existing.filter(Boolean) : [];
  const normalizedEntry = {
    completedDate: String(entry.completedDate || "").trim(),
    bookingId: String(entry.bookingId || "").trim(),
    provider: String(entry.provider || "").trim(),
    bookingRef: String(entry.bookingRef || "").trim(),
    notes: String(entry.notes || "").trim(),
    recordedAt: String(entry.recordedAt || "").trim(),
  };

  const withoutDuplicate = base.filter((item) => {
    const itemDate = String(item?.completedDate || "").trim();
    const itemBookingId = String(item?.bookingId || "").trim();
    if (!itemDate) return false;
    if (
      normalizedEntry.bookingId &&
      itemBookingId &&
      itemBookingId === normalizedEntry.bookingId
    ) {
      return false;
    }
    return itemDate !== normalizedEntry.completedDate;
  });

  return [normalizedEntry, ...withoutDuplicate].sort((a, b) =>
    String(b?.completedDate || "").localeCompare(String(a?.completedDate || ""))
  );
}

export function mergeInspectionHistory(existing = [], entry = null) {
  return mergeMaintenanceHistory(existing, entry);
}
