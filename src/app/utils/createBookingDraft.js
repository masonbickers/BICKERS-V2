const hasText = (value) => String(value ?? "").trim().length > 0;
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const hasEntries = (value) =>
  Boolean(value) && typeof value === "object" && Object.keys(value).length > 0;

export function hasMeaningfulCreateBookingDraft(
  draft = {},
  { initialStatus = "First Pencil", initialShootType = "Day" } = {}
) {
  return Boolean(
    hasText(draft.quoteNumber) ||
      hasItems(draft.quoteNumbers) ||
      hasText(draft.client) ||
      hasText(draft.production) ||
      hasText(draft.location) ||
      hasText(draft.po) ||
      hasText(draft.invoiceContactName) ||
      hasText(draft.invoiceContactEmail) ||
      hasText(draft.invoiceContactPhone) ||
      hasText(draft.notes) ||
      hasText(draft.statusReasonOther) ||
      hasText(draft.startDate) ||
      hasText(draft.endDate) ||
      hasText(draft.callTime) ||
      hasText(draft.hotelPaidBy) ||
      hasText(draft.hotelNights) ||
      hasText(draft.hotelPricePerNight) ||
      hasText(draft.riggingAddress) ||
      hasText(draft.customEmployee) ||
      (draft.status || initialStatus) !== initialStatus ||
      (draft.shootType || initialShootType) !== initialShootType ||
      draft.isRange === true ||
      draft.useCustomDates === true ||
      draft.hasHotel === true ||
      draft.hasRiggingAddress === true ||
      draft.isSecondPencil === true ||
      draft.isCrewed === true ||
      draft.hasHS === true ||
      draft.hasRiskAssessment === true ||
      draft.offRoadTracking === true ||
      Number(draft.requiredCrewCount ?? 1) !== 1 ||
      hasItems(draft.statusReasons) ||
      hasItems(draft.customDates) ||
      hasItems(draft.employees) ||
      hasItems(draft.vehicles) ||
      hasItems(draft.equipment) ||
      hasItems(draft.additionalContacts) ||
      hasEntries(draft.notesByDate) ||
      hasEntries(draft.callTimesByDate) ||
      hasEntries(draft.employeesByDate) ||
      hasEntries(draft.vehicleStatus)
  );
}
