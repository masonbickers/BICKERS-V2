"use client";

import { BICKERS_DEPLOYMENT_DEFAULTS, publicDeploymentConfig } from "./deploymentConfigCore";

const FALLBACK = Object.freeze(publicDeploymentConfig(BICKERS_DEPLOYMENT_DEFAULTS));

function readEmbeddedConfig() {
  const raw = process.env.NEXT_PUBLIC_DEPLOYMENT_CONFIG;
  if (!raw) return FALLBACK;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? Object.freeze({ ...FALLBACK, ...value }) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const PUBLIC_DEPLOYMENT_CONFIG = readEmbeddedConfig();

export function useDeploymentConfig() {
  return PUBLIC_DEPLOYMENT_CONFIG;
}
