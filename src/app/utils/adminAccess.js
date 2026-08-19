export const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

export const PLATFORM_ADMIN_EMAILS = [
  "mason@bickers.co.uk",
];

export function cleanAccessEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAdminEmail(value) {
  return ADMIN_EMAILS.includes(cleanAccessEmail(value));
}

export function isPlatformAdminEmail(value) {
  return PLATFORM_ADMIN_EMAILS.includes(cleanAccessEmail(value));
}
