const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const clean = (value) => String(value ?? "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();

export const BICKERS_DEPLOYMENT_DEFAULTS = Object.freeze({
  profile: "bickers",
  companyId: "bickers-action",
  allowedEmailDomains: ["bickers.co.uk"],
  supportEmail: "",
  siteTitle: "Bickers Booking System",
  displayName: "Bickers Action",
  shortName: "Bickers",
  companyLegalName: "Bickers Action Limited",
  companyDescription: "Film and television action vehicle operations",
  companyWebsite: "https://www.bickers.co.uk",
  companyLogoUrl: "/bickers-action-logo.png",
  loginImageUrl: "/login-page-photo.jpeg",
  emailFromName: "Bickers Action",
  emergencyAdminBootstrapEnabled: true,
  emergencyAdminEmails: ["mason@bickers.co.uk", "paul@bickers.co.uk", "adam@bickers.co.uk"],
  emergencyPlatformAdminEmails: ["mason@bickers.co.uk"],
});

const CUSTOMER_FIELDS = [
  ["APP_COMPANY_ID", "companyId", 64],
  ["APP_SUPPORT_EMAIL", "supportEmail", 254],
  ["APP_SITE_TITLE", "siteTitle", 100],
  ["APP_DISPLAY_NAME", "displayName", 80],
  ["APP_SHORT_NAME", "shortName", 40],
  ["APP_COMPANY_LEGAL_NAME", "companyLegalName", 120],
  ["APP_COMPANY_DESCRIPTION", "companyDescription", 240],
  ["APP_COMPANY_WEBSITE", "companyWebsite", 500],
  ["APP_COMPANY_LOGO_URL", "companyLogoUrl", 500],
  ["APP_LOGIN_IMAGE_URL", "loginImageUrl", 500],
  ["APP_EMAIL_FROM_NAME", "emailFromName", 80],
];

function parseList(value, normalizer = clean) {
  return [...new Set(clean(value).split(",").map(normalizer).filter(Boolean))];
}

function parseBoolean(value, fallback, name, errors) {
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  errors.push(`${name} must be a boolean.`);
  return fallback;
}

function isSafeAsset(value) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validWebsite(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseDeploymentConfig(environment = {}) {
  const profile = clean(environment.APP_DEPLOYMENT_PROFILE).toLowerCase() || "bickers";
  const errors = [];
  if (!new Set(["bickers", "customer"]).has(profile)) {
    errors.push("APP_DEPLOYMENT_PROFILE must be bickers or customer.");
  }
  if (profile !== "customer") {
    return { config: { ...BICKERS_DEPLOYMENT_DEFAULTS }, errors };
  }

  const config = { profile: "customer" };
  for (const [environmentName, property, maximum] of CUSTOMER_FIELDS) {
    const value = clean(environment[environmentName]);
    config[property] = value;
    if (!value) errors.push(`${environmentName} is required for customer deployments.`);
    if (value.length > maximum) errors.push(`${environmentName} must be ${maximum} characters or fewer.`);
  }

  config.allowedEmailDomains = parseList(environment.APP_ALLOWED_EMAIL_DOMAINS, (value) => clean(value).toLowerCase().replace(/^@/, ""));
  if (!config.allowedEmailDomains.length) errors.push("APP_ALLOWED_EMAIL_DOMAINS is required for customer deployments.");
  config.allowedEmailDomains.forEach((domain) => {
    if (!DOMAIN_RE.test(domain)) errors.push(`APP_ALLOWED_EMAIL_DOMAINS contains invalid domain: ${domain}.`);
  });

  if (config.companyId && !COMPANY_ID_RE.test(config.companyId)) errors.push("APP_COMPANY_ID is invalid.");
  if (config.supportEmail && !EMAIL_RE.test(config.supportEmail)) errors.push("APP_SUPPORT_EMAIL is invalid.");
  if (config.companyWebsite && !validWebsite(config.companyWebsite)) errors.push("APP_COMPANY_WEBSITE must be an HTTPS URL.");
  for (const [name, property] of [["APP_COMPANY_LOGO_URL", "companyLogoUrl"], ["APP_LOGIN_IMAGE_URL", "loginImageUrl"]]) {
    if (config[property] && !isSafeAsset(config[property])) {
      errors.push(`${name} is required for customer deployments.`);
      errors.push(`${name} must be a local path or HTTPS URL.`);
    }
  }

  config.emergencyAdminBootstrapEnabled = parseBoolean(
    environment.APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP,
    false,
    "APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP",
    errors
  );
  config.emergencyAdminEmails = parseList(environment.APP_EMERGENCY_ADMIN_EMAILS, cleanEmail);
  config.emergencyPlatformAdminEmails = parseList(environment.APP_EMERGENCY_PLATFORM_ADMIN_EMAILS, cleanEmail);
  [...config.emergencyAdminEmails, ...config.emergencyPlatformAdminEmails].forEach((email) => {
    if (!EMAIL_RE.test(email)) errors.push(`Emergency administrator email is invalid: ${email}.`);
  });
  if (!config.emergencyAdminBootstrapEnabled) {
    config.emergencyAdminEmails = [];
    config.emergencyPlatformAdminEmails = [];
  }
  return { config, errors };
}

export function requireValidDeploymentConfig(environment = {}) {
  const result = parseDeploymentConfig(environment);
  if (result.errors.length) {
    throw new Error(`Invalid deployment configuration:\n- ${result.errors.join("\n- ")}`);
  }
  return result.config;
}

export function publicDeploymentConfig(config) {
  const {
    allowedEmailDomains: _allowedEmailDomains,
    emergencyAdminEmails: _emergencyAdminEmails,
    emergencyPlatformAdminEmails: _emergencyPlatformAdminEmails,
    emergencyAdminBootstrapEnabled: _emergencyAdminBootstrapEnabled,
    ...publicConfig
  } = config;
  return publicConfig;
}

export function isEmailAllowedForDeployment(email, config) {
  const normalized = cleanEmail(email);
  if (!EMAIL_RE.test(normalized)) return false;
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return (config?.allowedEmailDomains || []).includes(domain);
}

export function isEmergencyAdminEmail(email, config) {
  return Boolean(config?.emergencyAdminBootstrapEnabled) && (config?.emergencyAdminEmails || []).includes(cleanEmail(email));
}

export function isEmergencyPlatformAdminEmail(email, config) {
  return Boolean(config?.emergencyAdminBootstrapEnabled) && (config?.emergencyPlatformAdminEmails || []).includes(cleanEmail(email));
}

export function deploymentSupplier(config) {
  return {
    legalName: config.companyLegalName,
    description: config.companyDescription,
    website: config.companyWebsite,
  };
}

export function deploymentMetadata(config) {
  return {
    title: config.siteTitle,
    description: config.companyDescription,
    manifest: "/manifest.json",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: config.shortName },
    icons: { icon: "/icons/icon-192x192.png", apple: "/icons/icon-192x192.png" },
  };
}

export function deploymentManifest(config) {
  return {
    name: config.displayName,
    short_name: config.shortName,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
