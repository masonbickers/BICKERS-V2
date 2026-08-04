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
    maintenanceTypeId: String(entry.maintenanceTypeId || "").trim().toLowerCase(),
    completedDate: String(entry.completedDate || "").trim(),
    bookingId: String(entry.bookingId || "").trim(),
    provider: String(entry.provider || "").trim(),
    bookingRef: String(entry.bookingRef || "").trim(),
    notes: String(entry.notes || "").trim(),
    recordedAt: String(entry.recordedAt || "").trim(),
    completedAt: String(entry.completedAt || entry.recordedAt || "").trim(),
    completedBy:
      entry.completedBy && typeof entry.completedBy === "object"
        ? {
            uid: String(entry.completedBy.uid || "").trim(),
            name: String(entry.completedBy.name || entry.completedBy.email || "").trim(),
            email: String(entry.completedBy.email || "").trim(),
          }
        : null,
    source: String(entry.source || "").trim(),
    documents: Array.isArray(entry.documents) ? entry.documents : [],
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

export function isCompletedMaintenanceBooking(booking, { type = "", vehicleId = "" } = {}) {
  if (String(booking?.status || "").trim().toLowerCase() !== "completed") return false;
  if (type && String(booking?.type || "").trim().toUpperCase() !== String(type).trim().toUpperCase()) {
    return false;
  }
  if (vehicleId && String(booking?.vehicleId || "").trim() !== String(vehicleId).trim()) {
    return false;
  }
  return true;
}

export function reconcileBookingCompletionHistory(existing = [], bookings = []) {
  const bookingsById = new Map(
    (Array.isArray(bookings) ? bookings : [])
      .filter((booking) => String(booking?.id || "").trim())
      .map((booking) => [String(booking.id).trim(), booking])
  );
  const removed = [];
  const history = (Array.isArray(existing) ? existing : []).filter((entry) => {
    const bookingId = String(entry?.bookingId || "").trim();
    if (!bookingId || !bookingsById.has(bookingId)) return true;
    const booking = bookingsById.get(bookingId);
    if (isCompletedMaintenanceBooking(booking)) return true;
    removed.push(entry);
    return false;
  });
  return { history, removed };
}
