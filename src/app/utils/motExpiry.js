const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateOnly = (value) => {
  const clean = String(value || "").trim().slice(0, 10);
  return DATE_ONLY_PATTERN.test(clean) ? clean : "";
};

const isPassedMot = (test = {}) =>
  String(test?.testResult || "").trim().toUpperCase() === "PASSED";

const completedDateValue = (test = {}) => dateOnly(test?.completedDate);

export const getAuthoritativeDvsaMotExpiry = (vehicle = {}) => {
  const candidates = [
    vehicle?.dvsaLatestMot,
    ...(Array.isArray(vehicle?.dvsaMotTests) ? vehicle.dvsaMotTests : []),
  ]
    .filter((test) => isPassedMot(test) && dateOnly(test?.expiryDate))
    .sort((a, b) => completedDateValue(b).localeCompare(completedDateValue(a)));

  return dateOnly(candidates[0]?.expiryDate);
};

export const resolveCompletedMotExpiry = ({
  vehicle = {},
  fallbackExpiry = "",
} = {}) =>
  getAuthoritativeDvsaMotExpiry(vehicle) ||
  dateOnly(fallbackExpiry);
