// Client authorization is role-based. Deployment-specific break-glass email
// lists live exclusively in the server-only deployment configuration module.
export const ADMIN_EMAILS = [];
export const PLATFORM_ADMIN_EMAILS = [];

export function cleanAccessEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAdminEmail(value) {
  return ADMIN_EMAILS.includes(cleanAccessEmail(value));
}

export function isPlatformAdminEmail(value) {
  return PLATFORM_ADMIN_EMAILS.includes(cleanAccessEmail(value));
}
