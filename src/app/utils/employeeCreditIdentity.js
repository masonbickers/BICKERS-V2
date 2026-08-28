const CREDIT_NAME_ALIASES = new Map([
  ["tobias oxley", "toby oxley"],
]);

export function normaliseEmployeeCreditIdentity(value) {
  const normalised = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return CREDIT_NAME_ALIASES.get(normalised) || normalised;
}
