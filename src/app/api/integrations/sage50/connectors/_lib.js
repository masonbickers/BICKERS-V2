import crypto from "node:crypto";
import {
  adminCreateDocument,
  adminListDocuments,
  adminReadDocument,
} from "../../../_firebaseAdminRest.js";
import { verifyConnectorCredential } from "../../../../utils/sage50ConnectorIdentity.js";
import {
  adminCompanyId,
  isPlatformAdminAccess,
  jsonError,
} from "../../../admin/_lib.js";

export const CONNECTOR_COLLECTION = "sage50Connectors";

const text = (value) => String(value || "").trim();

export async function resolveManagedTenant(auth, requestedTenantId) {
  if (!isPlatformAdminAccess(auth.userData)) {
    const tenantId = adminCompanyId(auth.userData);
    if (!tenantId) throw new Error("Administrator company access is not configured.");
    return tenantId;
  }
  const tenantId = text(requestedTenantId);
  if (!tenantId || tenantId.includes("/")) {
    throw new Error("Platform administrators must explicitly select a valid tenant.");
  }
  const company = await adminReadDocument("platformCompanies", tenantId);
  if (!company) throw new Error("Selected tenant was not found.");
  return tenantId;
}

export async function findTenantConnector(tenantId) {
  const rows = await adminListDocuments(CONNECTOR_COLLECTION, { maxDocuments: 500 });
  return rows.find(({ data }) => text(data.tenantId) === text(tenantId)) || null;
}

export async function writeConnectorAudit({
  action,
  actor = null,
  connector,
  details = {},
  now = new Date().toISOString(),
}) {
  await adminCreateDocument("adminAuditLogs", {
    actorUid: actor?.uid || connector?.connectorId || "",
    actorEmail: actor?.email || "",
    actorRole: actor?.role || "machine",
    targetType: "sage50Connector",
    targetId: connector?.connectorId || "",
    companyId: connector?.tenantId || "",
    action,
    area: "Sage 50 connector",
    before: null,
    after: null,
    details,
    createdAt: now,
  });
}

export function connectorBearer(req) {
  const value = text(req.headers.get("authorization"));
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export function connectorIdHeader(req) {
  const value = text(req.headers.get("x-sage-connector-id"));
  return value && value.length <= 180 && !value.includes("/") ? value : "";
}

export function newConnectorId() {
  return `s50-${crypto.randomUUID()}`;
}

export function connectorError(message, status = 400) {
  return jsonError(message, status);
}

export async function authenticateConnector(req) {
  const connectorId = connectorIdHeader(req);
  const credential = connectorBearer(req);
  if (!connectorId || !credential) {
    return { error: connectorError("Connector credentials are required.", 401) };
  }
  const connector = await adminReadDocument(CONNECTOR_COLLECTION, connectorId);
  if (
    !connector ||
    connector.connectorId !== connectorId ||
    !verifyConnectorCredential(credential, connector.credentialHash)
  ) {
    return { error: connectorError("Connector authentication failed.", 401) };
  }
  if (connector.isEnabled !== true) {
    return { error: connectorError("Connector is disabled.", 403) };
  }
  return { connector };
}
