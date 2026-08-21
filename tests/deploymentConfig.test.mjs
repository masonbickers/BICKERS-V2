import assert from "node:assert/strict";
import test from "node:test";

import {
  BICKERS_DEPLOYMENT_DEFAULTS,
  deploymentSupplier,
  deploymentManifest,
  deploymentMetadata,
  isEmailAllowedForDeployment,
  isEmergencyAdminEmail,
  isEmergencyPlatformAdminEmail,
  parseDeploymentConfig,
  publicDeploymentConfig,
  requireValidDeploymentConfig,
} from "../src/app/config/deploymentConfigCore.js";

const CUSTOMER_ENV = {
  APP_DEPLOYMENT_PROFILE: "customer",
  APP_COMPANY_ID: "example-transport",
  APP_ALLOWED_EMAIL_DOMAINS: "example.com, staff.example.com",
  APP_SUPPORT_EMAIL: "support@example.com",
  APP_SITE_TITLE: "Example Operations System",
  APP_DISPLAY_NAME: "Example Operations",
  APP_SHORT_NAME: "Example",
  APP_COMPANY_LEGAL_NAME: "Example Transport Limited",
  APP_COMPANY_DESCRIPTION: "Transport operations",
  APP_COMPANY_WEBSITE: "https://example.com",
  APP_COMPANY_LOGO_URL: "https://example.com/logo.png",
  APP_LOGIN_IMAGE_URL: "/customer-login.jpg",
  APP_EMAIL_FROM_NAME: "Example Transport",
};

test("empty deployment environment preserves the complete Bickers compatibility profile", () => {
  const config = requireValidDeploymentConfig({});
  assert.deepEqual(config, { ...BICKERS_DEPLOYMENT_DEFAULTS });
  assert.equal(config.companyId, "bickers-action");
  assert.deepEqual(config.allowedEmailDomains, ["bickers.co.uk"]);
  assert.equal(config.supportEmail, "");
  assert.equal(config.emergencyAdminBootstrapEnabled, true);
});

test("customer deployment requires every identity field", () => {
  const result = parseDeploymentConfig({ APP_DEPLOYMENT_PROFILE: "customer" });
  assert.ok(result.errors.some((message) => message.includes("APP_COMPANY_ID is required")));
  assert.ok(result.errors.some((message) => message.includes("APP_SUPPORT_EMAIL is required")));
  assert.throws(
    () => requireValidDeploymentConfig({ APP_DEPLOYMENT_PROFILE: "customer" }),
    /Invalid deployment configuration/
  );
});

test("complete customer deployment normalizes domains and keeps emergency bootstrap disabled", () => {
  const config = requireValidDeploymentConfig({
    ...CUSTOMER_ENV,
    APP_ALLOWED_EMAIL_DOMAINS: "@EXAMPLE.COM,staff.example.com,example.com",
  });
  assert.deepEqual(config.allowedEmailDomains, ["example.com", "staff.example.com"]);
  assert.equal(config.emergencyAdminBootstrapEnabled, false);
  assert.deepEqual(config.emergencyAdminEmails, []);
});

test("domain authorization uses exact normalized domain equality", () => {
  const config = requireValidDeploymentConfig(CUSTOMER_ENV);
  assert.equal(isEmailAllowedForDeployment("USER@EXAMPLE.COM", config), true);
  assert.equal(isEmailAllowedForDeployment("user@staff.example.com", config), true);
  assert.equal(isEmailAllowedForDeployment("user@evil-example.com", config), false);
  assert.equal(isEmailAllowedForDeployment("user@evil.example.com", config), false);
  assert.equal(isEmailAllowedForDeployment("not-an-email", config), false);
});

test("public projection excludes domains and emergency administrator data", () => {
  const config = requireValidDeploymentConfig({
    ...CUSTOMER_ENV,
    APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP: "true",
    APP_EMERGENCY_ADMIN_EMAILS: "owner@example.com",
  });
  const publicConfig = publicDeploymentConfig(config);
  assert.equal(publicConfig.companyId, "example-transport");
  assert.equal("allowedEmailDomains" in publicConfig, false);
  assert.equal("emergencyAdminEmails" in publicConfig, false);
  assert.equal(JSON.stringify(publicConfig).includes("owner@example.com"), false);
});

test("supplier identity and emergency lists are deployment-specific", () => {
  const customer = requireValidDeploymentConfig(CUSTOMER_ENV);
  assert.deepEqual(deploymentSupplier(customer), {
    legalName: "Example Transport Limited",
    description: "Transport operations",
    website: "https://example.com",
  });
  assert.equal(isEmergencyAdminEmail("mason@bickers.co.uk", customer), false);
  assert.equal(isEmergencyPlatformAdminEmail("mason@bickers.co.uk", customer), false);

  const bickers = requireValidDeploymentConfig({});
  assert.equal(isEmergencyAdminEmail("MASON@BICKERS.CO.UK", bickers), true);
  assert.equal(isEmergencyPlatformAdminEmail("paul@bickers.co.uk", bickers), false);
});

test("metadata and the preserved manifest URL use deployment branding", () => {
  const customer = publicDeploymentConfig(requireValidDeploymentConfig(CUSTOMER_ENV));
  const metadata = deploymentMetadata(customer);
  const manifest = deploymentManifest(customer);
  assert.equal(metadata.title, "Example Operations System");
  assert.equal(metadata.manifest, "/manifest.json");
  assert.equal(metadata.appleWebApp.title, "Example");
  assert.equal(manifest.name, "Example Operations");
  assert.equal(manifest.short_name, "Example");
  assert.equal(manifest.start_url, "/");
});

test("invalid ids, domains, emails, booleans and asset URLs fail validation", () => {
  const result = parseDeploymentConfig({
    ...CUSTOMER_ENV,
    APP_COMPANY_ID: "Bad Company!",
    APP_ALLOWED_EMAIL_DOMAINS: "https://example.com",
    APP_SUPPORT_EMAIL: "not-an-email",
    APP_COMPANY_LOGO_URL: "javascript:alert(1)",
    APP_ENABLE_EMERGENCY_ADMIN_BOOTSTRAP: "perhaps",
  });
  assert.ok(result.errors.some((message) => message.includes("APP_COMPANY_ID is invalid")));
  assert.ok(result.errors.some((message) => message.includes("invalid domain")));
  assert.ok(result.errors.some((message) => message.includes("APP_SUPPORT_EMAIL is invalid")));
  assert.ok(result.errors.some((message) => message.includes("APP_COMPANY_LOGO_URL is required")));
  assert.ok(result.errors.some((message) => message.includes("local path or HTTPS URL")));
  assert.ok(result.errors.some((message) => message.includes("must be a boolean")));
});

test("overlong identity values and unsafe protocol-relative assets fail instead of being truncated", () => {
  const result = parseDeploymentConfig({
    ...CUSTOMER_ENV,
    APP_DISPLAY_NAME: "x".repeat(81),
    APP_LOGIN_IMAGE_URL: "//untrusted.example/image.jpg",
  });
  assert.ok(result.errors.some((message) => message.includes("APP_DISPLAY_NAME must be 80")));
  assert.ok(result.errors.some((message) => message.includes("APP_LOGIN_IMAGE_URL must be a local path or HTTPS URL")));
});
