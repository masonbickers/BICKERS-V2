const COMPANY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BICKERS_DEPLOYMENT_DEFAULTS = Object.freeze({
  profile: "bickers",
  companyId: "bickers-action",
  allowedEmailDomains: Object.freeze(["bickers.co.uk"]),
  supportEmail: "",
  siteTitle: "Bickers Booking System",
  displayName: "Bickers Booking",
  shortName: "Bickers",
  legalName: "Bickers Action",
  companyDescription: "Film and TV Action Vehicles",
  companyWebsite: "www.bickers.co.uk",
  companyLogoUrl: "/bickers-action-logo.png",
  loginImageUrl: "/login-page-photo.jpeg",
  emailFromName: "Bickers Action",
  emergencyAdminBootstrapEnabled: true,
  emergencyAdminEmails: Object.freeze([
    "mason@bickers.co.uk",
    "paul@bickers.co.uk",
    "adam@bickers.co.uk",
  ]),
  emergencyPlatformAdminEmails: Object.freeze(["mason@bickers.co.uk"]),
});

const clean = (value, max = 240) => String(value ?? "").trim().slice(0, max);
const cleanLower = (value, max) => clean(value, max).toLowerCase();

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(",");
}

export function normalizeEmail(value) {
  return cleanLower(value, 320);
}

export function normalizeDomain(value) {
  return cleanLower(value, 253).replace(/^@+/, "").replace(/\.+$/, "");
}

function uniqueList(values, normalize) {
  return [...new Set(splitList(values).map(normalize).filter(Boolean))];
}

function booleanValue(value, fallback) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function safeAssetUrl(value) {
  const candidate = clean(value, 1000);
  if (!candidate) return "";
  if (/^\/(?!\/)/.test(candidate) && !candidate.includes("\\")) return candidate;
  if (!/^https:\/\//i.test(candidate)) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? candidate : "";
  } catch {
    return "";
  }
}

function envValue(env, name, fallback = "") {
  return Object.prototype.hasOwnProperty.call(env, name) && String(env[name] ?? "").trim() !== ""
    ? env[name]
    : fallback;
}

export function parseDeploymentConfig(env = {}) {
  const requestedProfile = cleanLower(envValue(env, "APP_DEPLOYMENT_PROFILE", "bickers"), 30);
  const profile = requestedProfile || "bickers";
  const isBickers = profile === "bickers";
  const defaults = isBickers ? BICKERS_DEPLOYMENT_DEFAULTS : {};
  const errors = [];

  const maxLengths = {
    APP_COMPANY_ID: 80,
    APP_SUPPORT_EMAIL: 320,
    APP_SITE_TITLE: 100,
    APP_DISPLAY_NAME: 80,
    APP_SHORT_NAME: 30,
    APP_COMPANY_LEGAL_NAME: 160,
    APP_COMPANY_DESCRIPTION: 240,
    APP_COMPANY_WEBSITE: 300,
    APP_COMPANY_LOGO_URL: 1000,
    APP_LOGIN_IMAGE_URL: 1000,
    APP_EMAIL_FROM_NAME: 120,
  };
  Object.entries(maxLengths).forEach(([name, max]) => {
    if (String(env[name] ?? "").trim().length > max) errors.push(`${name} must be ${max} characters or fewer.`);
  });

  if (!["bickers", "customer"].includes(profile)) {
    errors.push("APP_DEPLOYMENT_PROFILE must be either bickers or customer.");
  }

  const config = {
    profile,
    companyId: cleanLower(envValue(env, "APP_COMPANY_ID", defaults.companyId), 80),
    allowedEmailDomains: uniqueList(
      envValue(env, "APP_ALLOWED_EMAIL_DOMAINS", defaults.allowedEmailDomains || []),
      normalizeDomain
    ),
    supportEmail: normalizeEmail(envValue(env, "APP_SUPPORT_EMAIL", defaults.supportEmail)),
    siteTitle: clean(envValue(env, "APP_SITE_TITLE", defaults.siteTitle), 100),
    displayName: clean(envValue(env, "APP_DISPLAY_NAME", defaults.displayName), 80),
    shortName: clean(envValue(env, "APP_SHORT_NAME", defaults.shortName), 30),
    legalName: clean(envValue(env, "APP_COMPANY_LEGAL_NAME", defaults.legalName), 160),
    companyDescription: clean(envValue(env, "APP_COMPANY_DESCRIPTION", defaults.companyDescription), 240),
    companyWebsite: clean(envValue(env, "APP_COMPANY_WEBSITE", defaults.companyWebsite), 300),
    companyLogoUrl: safeAssetUrl(envValue(env, "APP_COMPANY_LOGO_URL", defaults.companyLogoUrl)),
    loginImageUrl: safeAssetUrl(envValue(env, "APP_LOGIN_IMAGE_URL", defaults.loginImageUrl)),
    emailFromName: clean(envValue(env, "APP_EMAIL_FROM_NAME", defaults.emailFromName), 120),
    emergencyAdminBootstrapEnabled: booleanValue(
      envValue(env, "APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP", isBickers ? "true" : "false"),
      isBickers
    ),
    emergencyAdminEmails: uniqueList(
      envValue(env, "APP_EMERGENCY_ADMIN_EMAILS", defaults.emergencyAdminEmails || []),
      normalizeEmail
    ),
    emergencyPlatformAdminEmails: uniqueList(
      envValue(env, "APP_EMERGENCY_PLATFORM_ADMIN_EMAILS", defaults.emergencyPlatformAdminEmails || []),
      normalizeEmail
    ),
  };

  if (!COMPANY_ID_PATTERN.test(config.companyId)) errors.push("APP_COMPANY_ID is invalid.");
  if (!config.allowedEmailDomains.length) errors.push("APP_ALLOWED_EMAIL_DOMAINS must contain at least one domain.");
  config.allowedEmailDomains.forEach((domain) => {
    if (!DOMAIN_PATTERN.test(domain)) errors.push(`APP_ALLOWED_EMAIL_DOMAINS contains an invalid domain: ${domain}`);
  });
  if (config.supportEmail && !EMAIL_PATTERN.test(config.supportEmail)) errors.push("APP_SUPPORT_EMAIL is invalid.");
  if (String(env.APP_COMPANY_LOGO_URL ?? "").trim() && !config.companyLogoUrl) {
    errors.push("APP_COMPANY_LOGO_URL must be a local path or HTTPS URL.");
  }
  if (String(env.APP_LOGIN_IMAGE_URL ?? "").trim() && !config.loginImageUrl) {
    errors.push("APP_LOGIN_IMAGE_URL must be a local path or HTTPS URL.");
  }
  [...config.emergencyAdminEmails, ...config.emergencyPlatformAdminEmails].forEach((email) => {
    if (!EMAIL_PATTERN.test(email)) errors.push(`Emergency administrator email is invalid: ${email}`);
  });
  if (config.emergencyAdminBootstrapEnabled == null) {
    errors.push("APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP must be a boolean value.");
  }

  const requiredCustomerFields = [
    ["APP_COMPANY_ID", config.companyId],
    ["APP_ALLOWED_EMAIL_DOMAINS", config.allowedEmailDomains.length],
    ["APP_SUPPORT_EMAIL", config.supportEmail],
    ["APP_SITE_TITLE", config.siteTitle],
    ["APP_DISPLAY_NAME", config.displayName],
    ["APP_SHORT_NAME", config.shortName],
    ["APP_COMPANY_LEGAL_NAME", config.legalName],
    ["APP_COMPANY_DESCRIPTION", config.companyDescription],
    ["APP_COMPANY_WEBSITE", config.companyWebsite],
    ["APP_COMPANY_LOGO_URL", config.companyLogoUrl],
    ["APP_LOGIN_IMAGE_URL", config.loginImageUrl],
    ["APP_EMAIL_FROM_NAME", config.emailFromName],
  ];
  if (profile === "customer") {
    requiredCustomerFields.forEach(([name, value]) => {
      if (!value || !String(env[name] ?? "").trim()) errors.push(`${name} is required for customer deployments.`);
    });
  }

  return { config: Object.freeze(config), errors: [...new Set(errors)] };
}

export function requireValidDeploymentConfig(env = {}) {
  const result = parseDeploymentConfig(env);
  if (result.errors.length) {
    const error = new Error(`Invalid deployment configuration:\n- ${result.errors.join("\n- ")}`);
    error.code = "invalid_deployment_configuration";
    error.details = result.errors;
    throw error;
  }
  return result.config;
}

export function publicDeploymentConfig(config) {
  return Object.freeze({
    profile: config.profile,
    companyId: config.companyId,
    supportEmail: config.supportEmail,
    siteTitle: config.siteTitle,
    displayName: config.displayName,
    shortName: config.shortName,
    legalName: config.legalName,
    companyDescription: config.companyDescription,
    companyWebsite: config.companyWebsite,
    companyLogoUrl: config.companyLogoUrl,
    loginImageUrl: config.loginImageUrl,
  });
}

export function isEmailAllowedForDeployment(email, config) {
  const normalized = normalizeEmail(email);
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return false;
  const domain = normalized.slice(separator + 1);
  return config.allowedEmailDomains.includes(domain);
}

export function deploymentSupplier(config) {
  return Object.freeze({
    legalName: config.legalName,
    description: config.companyDescription,
    website: config.companyWebsite,
  });
}

export function deploymentMetadata(config) {
  return {
    title: config.siteTitle,
    description: "Manage your bookings, vehicles and employees",
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: config.shortName,
    },
    icons: {
      icon: "/icons/icon-192x192.png",
      apple: "/icons/icon-192x192.png",
    },
  };
}

export function deploymentManifest(config) {
  return {
    name: config.displayName,
    short_name: config.shortName,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f9",
    theme_color: "#000000",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [
      {
        name: "Create booking",
        short_name: "New booking",
        url: "/create-booking",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Timesheets",
        short_name: "Timesheets",
        url: "/timesheets",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

export function isEmergencyAdminEmail(email, config) {
  if (!config.emergencyAdminBootstrapEnabled) return false;
  return config.emergencyAdminEmails.includes(normalizeEmail(email));
}

export function isEmergencyPlatformAdminEmail(email, config) {
  if (!config.emergencyAdminBootstrapEnabled) return false;
  return config.emergencyPlatformAdminEmails.includes(normalizeEmail(email));
}
