const text = (value) => String(value ?? "").trim();

export const hasImportedQuoteSelection = (booking = {}) =>
  Object.prototype.hasOwnProperty.call(booking, "importedQuoteNumber");

export const verifiedImportedQuoteNumber = (booking = {}) => {
  if (!hasImportedQuoteSelection(booking)) return "";
  const selected = text(booking.importedQuoteNumber);
  const proof = booking.importedQuoteMatch;
  const bookingId = text(booking.__bookingId || booking.id || booking.bookingId);
  const jobNumber = text(booking.jobNumber);
  if (
    !selected ||
    proof?.method !== "exact-job-and-date" ||
    text(proof.bookingId) !== bookingId ||
    text(proof.jobNumber) !== jobNumber ||
    text(proof.quoteNumber) !== selected ||
    !Array.isArray(proof.matchedDates) ||
    proof.matchedDates.length === 0
  ) return "";
  return selected;
};
