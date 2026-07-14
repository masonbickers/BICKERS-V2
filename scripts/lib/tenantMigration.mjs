export const STORAGE_ROOTS = Object.freeze([
  "booking_pdfs/",
  "h-and-s/",
  "hr/",
  "images/",
  "invoice_documents/",
  "job_attachments/",
  "maintenance-quotes/",
  "profilePhotos/",
  "quotes/",
  "recce-photos/",
  "vehicles/",
]);

const clean = (value) => String(value || "").trim();
const normalizeRole = (value) => {
  const role = clean(value).toLowerCase();
  if (["platformadmin", "platform admin", "superadmin", "super admin"].includes(role)) return "platformAdmin";
  if (["admin", "companyadmin", "company admin"].includes(role)) return "admin";
  return "user";
};

export function classifyCompany(data = {}, companyId) {
  const existing = clean(data.companyId);
  if (!existing) return "missing";
  return existing === companyId ? "target" : "conflict";
}

export function normalizeUserAccessRecord(data = {}, { id, companyId }) {
  const appAccess = data.appAccess && typeof data.appAccess === "object"
    ? { user: data.appAccess.user === true, service: data.appAccess.service === true }
    : {
        user: data.isService !== true,
        service: data.isService === true,
      };
  if (!appAccess.user && !appAccess.service) appAccess.user = true;
  const requestedWorkspace = clean(data.defaultWorkspace).toLowerCase();
  const defaultWorkspace = requestedWorkspace === "service" && appAccess.service
    ? "service"
    : "user";
  const email = clean(data.email).toLowerCase();
  if (!email) throw new Error(`users/${id} has no email and cannot be cut over safely.`);

  return {
    ...data,
    uid: clean(data.uid) || id,
    email,
    companyId,
    isEnabled: typeof data.isEnabled === "boolean"
      ? data.isEnabled
      : !(data.disabled === true || data.archived === true || data.active === false),
    role: normalizeRole(data.role),
    appAccess,
    defaultWorkspace,
    credentialResetRequired: data.credentialResetRequired === true,
  };
}

export function isLegacyStoragePath(value) {
  const path = clean(value).replace(/^\/+/, "");
  return STORAGE_ROOTS.some((root) => path.startsWith(root));
}

export function targetStoragePath(value, companyId) {
  const path = clean(value).replace(/^\/+/, "");
  if (!path || path.startsWith("companies/")) return path;
  return isLegacyStoragePath(path) ? `companies/${companyId}/${path}` : path;
}

export function collectLegacyStoragePaths(value, paths = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLegacyStoragePaths(item, paths));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLegacyStoragePaths(item, paths));
  } else if (typeof value === "string" && isLegacyStoragePath(value)) {
    paths.add(value.replace(/^\/+/, ""));
  }
  return paths;
}

export function rewriteStorageReferences(value, companyId) {
  if (Array.isArray(value)) return value.map((item) => rewriteStorageReferences(item, companyId));
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteStorageReferences(item, companyId)])
    );
  }
  return typeof value === "string" ? targetStoragePath(value, companyId) : value;
}
