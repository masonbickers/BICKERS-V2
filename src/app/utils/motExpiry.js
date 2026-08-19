const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateOnly = (value) => {
  const clean = String(value || "").trim().slice(0, 10);
  return DATE_ONLY_PATTERN.test(clean) ? clean : "";
};

const isPassedMot = (test = {}) =>
  String(test?.testResult || "").trim().toUpperCase() === "PASSED";

const completedDateValue = (test = {}) => dateOnly(test?.completedDate);

export const getAuthoritativeDvsaMotExpiry = (vehicle = {}, { notBeforeCompletionDate = "" } = {}) => {
  const notBefore = dateOnly(notBeforeCompletionDate);
  const candidates = [
    vehicle?.dvsaLatestMot,
    ...(Array.isArray(vehicle?.dvsaMotTests) ? vehicle.dvsaMotTests : []),
  ]
    .filter((test) =>
      isPassedMot(test) &&
      dateOnly(test?.expiryDate) &&
      (!notBefore || completedDateValue(test) >= notBefore)
    )
    .sort((a, b) => completedDateValue(b).localeCompare(completedDateValue(a)));

  return dateOnly(candidates[0]?.expiryDate);
};

export const resolveCompletedMotExpiry = ({
  vehicle = {},
  fallbackExpiry = "",
  completedDate = "",
} = {}) =>
  getAuthoritativeDvsaMotExpiry(vehicle, { notBeforeCompletionDate: completedDate }) ||
  (dateOnly(completedDate) ? "" : dateOnly(fallbackExpiry));
