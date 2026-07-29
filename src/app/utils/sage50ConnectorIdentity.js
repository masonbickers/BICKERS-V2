import crypto from "node:crypto";
import { SAGE_INTEGRATION_PRODUCT } from "./sage50ConnectorContract.js";

export const SAGE_50_CONNECTOR_MODE = "windows_sdo_connector";
export const SAGE_50_CONNECTOR_STATUSES = Object.freeze([
  "offline",
  "online",
  "degraded",
  "error",
  "disabled",
]);

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);

export function createConnectorCredential(connectorId) {
  const prefix = `s50c_${text(connectorId, 12)}_`;
  const credential = `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
  return {
    credential,
    credentialPrefix: prefix,
    credentialHash: hashConnectorCredential(credential),
  };
}

export function hashConnectorCredential(credential) {
  return crypto
    .createHash("sha256")
    .update(String(credential || ""), "utf8")
    .digest("hex");
}

export function verifyConnectorCredential(credential, expectedHash) {
  const actual = Buffer.from(hashConnectorCredential(credential), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function connectorActorSnapshot(auth = {}) {
  return {
    uid: text(auth.verifiedUser?.uid, 180),
    email: text(auth.verifiedUser?.email, 254).toLowerCase(),
    role: text(auth.userData?.role, 40),
  };
}

export function createSage50ConnectorRecord({
  connectorId,
  tenantId,
  displayName,
  actor,
  credentialHash,
  credentialPrefix,
  now,
} = {}) {
  return {
    provider: SAGE_INTEGRATION_PRODUCT,
    mode: SAGE_50_CONNECTOR_MODE,
    connectorId: text(connectorId, 180),
    tenantId: text(tenantId, 180),
    companyId: text(tenantId, 180),
    displayName: text(displayName, 120) || "Sage 50 Windows Connector",
    status: "offline",
    isEnabled: true,
    machineName: null,
    connectorVersion: null,
    sageVersion: null,
    sdoVersion: null,
    sageCompanyName: null,
    sageCompanyIdentifier: null,
    credentialVersion: 1,
    credentialHash,
    credentialPrefix,
    lastHeartbeatAt: null,
    lastSuccessfulJobAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    registeredAt: now,
    registeredBy: actor,
    disabledAt: null,
    disabledBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitiseHeartbeat(body = {}) {
  const requestedStatus = text(body.status, 20).toLowerCase();
  const status = ["online", "degraded", "error"].includes(requestedStatus)
    ? requestedStatus
    : "online";
  return {
    status,
    machineName: text(body.machineName, 120) || null,
    connectorVersion: text(body.connectorVersion, 60) || null,
    sageVersion: text(body.sageVersion, 80) || null,
    sdoVersion: text(body.sdoVersion, 80) || null,
    sageCompanyName: text(body.sageCompanyName, 160) || null,
    sageCompanyIdentifier: text(body.sageCompanyIdentifier, 160) || null,
    lastErrorCode: status === "error" || status === "degraded"
      ? text(body.lastErrorCode, 80) || null
      : null,
    lastErrorMessage: status === "error" || status === "degraded"
      ? text(body.lastErrorMessage, 500) || null
      : null,
  };
}

export function publicConnectorStatus(record = {}, nowMs = Date.now()) {
  const heartbeatMs = Date.parse(record.lastHeartbeatAt || "");
  const stale = !Number.isFinite(heartbeatMs) || nowMs - heartbeatMs > 5 * 60 * 1000;
  return {
    provider: record.provider,
    mode: record.mode,
    connectorId: record.connectorId,
    tenantId: record.tenantId,
    displayName: record.displayName,
    status: !record.isEnabled ? "disabled" : stale ? "offline" : record.status,
    isEnabled: record.isEnabled === true,
    machineName: record.machineName || null,
    connectorVersion: record.connectorVersion || null,
    sageVersion: record.sageVersion || null,
    sdoVersion: record.sdoVersion || null,
    sageCompanyName: record.sageCompanyName || null,
    sageCompanyIdentifier: record.sageCompanyIdentifier || null,
    credentialVersion: Number(record.credentialVersion || 0),
    credentialPrefix: record.credentialPrefix || "",
    lastHeartbeatAt: record.lastHeartbeatAt || null,
    lastSuccessfulJobAt: record.lastSuccessfulJobAt || null,
    lastErrorCode: record.lastErrorCode || null,
    lastErrorMessage: record.lastErrorMessage || null,
    registeredAt: record.registeredAt || null,
    disabledAt: record.disabledAt || null,
    updatedAt: record.updatedAt || null,
  };
}
