import "server-only";

import {
  deploymentSupplier,
  isEmailAllowedForDeployment,
  isEmergencyAdminEmail,
  isEmergencyPlatformAdminEmail,
  publicDeploymentConfig,
  requireValidDeploymentConfig,
} from "./deploymentConfigCore.js";

let cachedConfig = null;

export function getDeploymentConfig() {
  cachedConfig ||= requireValidDeploymentConfig(process.env);
  return cachedConfig;
}

export function getPublicDeploymentConfig() {
  return publicDeploymentConfig(getDeploymentConfig());
}

export function getDeploymentSupplier() {
  return deploymentSupplier(getDeploymentConfig());
}

export function isDeploymentEmailAllowed(email) {
  return isEmailAllowedForDeployment(email, getDeploymentConfig());
}

export function deploymentEmailAccessMessage() {
  const domains = getDeploymentConfig().allowedEmailDomains;
  return domains.length === 1
    ? `Only @${domains[0]} accounts can access this app.`
    : "Only accounts from an approved company email domain can access this app.";
}

export function isDeploymentEmergencyAdmin(email) {
  return isEmergencyAdminEmail(email, getDeploymentConfig());
}

export function isDeploymentEmergencyPlatformAdmin(email) {
  return isEmergencyPlatformAdminEmail(email, getDeploymentConfig());
}
