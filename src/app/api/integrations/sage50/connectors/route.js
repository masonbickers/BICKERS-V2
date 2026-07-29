import {
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest.js";
import { jsonError, requireAdminFromRequest } from "../../../admin/_lib.js";
import {
  connectorActorSnapshot,
  createConnectorCredential,
  createSage50ConnectorRecord,
  publicConnectorStatus,
} from "../../../../utils/sage50ConnectorIdentity.js";
import {
  CONNECTOR_COLLECTION,
  findTenantConnector,
  newConnectorId,
  resolveManagedTenant,
  writeConnectorAudit,
} from "./_lib.js";

export const runtime = "nodejs";

const text = (value, max = 200) => String(value || "").trim().slice(0, max);

export async function GET(req) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (auth.error) return auth.error;
    const tenantId = await resolveManagedTenant(
      auth,
      new URL(req.url).searchParams.get("tenantId")
    );
    const row = await findTenantConnector(tenantId);
    return Response.json({
      ok: true,
      connector: row ? publicConnectorStatus(row.data) : null,
    });
  } catch (error) {
    return jsonError(error?.message || "Could not read connector status.", 400);
  }
}

export async function POST(req) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 40).toLowerCase() || "register";
    const tenantId = await resolveManagedTenant(auth, body.tenantId);
    const actor = connectorActorSnapshot(auth);
    const now = new Date().toISOString();
    const existingRow = await findTenantConnector(tenantId);

    if (action === "register") {
      if (existingRow) return jsonError("This tenant already has a Sage 50 connector.", 409);
      const connectorId = newConnectorId();
      const secret = createConnectorCredential(connectorId);
      const record = createSage50ConnectorRecord({
        connectorId,
        tenantId,
        displayName: body.displayName,
        actor,
        credentialHash: secret.credentialHash,
        credentialPrefix: secret.credentialPrefix,
        now,
      });
      await adminPatchDocument(CONNECTOR_COLLECTION, connectorId, record);
      await writeConnectorAudit({
        action: "sage50_connector_registered",
        actor,
        connector: record,
        details: { credentialVersion: 1 },
        now,
      });
      return Response.json({
        ok: true,
        connector: publicConnectorStatus(record),
        credential: secret.credential,
      }, { status: 201 });
    }

    if (!existingRow) return jsonError("Sage 50 connector not found.", 404);
    const current = await adminReadDocument(CONNECTOR_COLLECTION, existingRow.id);
    if (!current || current.tenantId !== tenantId) return jsonError("Connector access denied.", 403);

    if (action === "rotate_credential") {
      const secret = createConnectorCredential(current.connectorId);
      const next = {
        ...current,
        credentialVersion: Number(current.credentialVersion || 0) + 1,
        credentialHash: secret.credentialHash,
        credentialPrefix: secret.credentialPrefix,
        status: current.isEnabled ? "offline" : "disabled",
        lastHeartbeatAt: null,
        updatedAt: now,
      };
      await adminPatchDocument(CONNECTOR_COLLECTION, existingRow.id, next);
      await writeConnectorAudit({
        action: "sage50_connector_credential_rotated",
        actor,
        connector: next,
        details: { credentialVersion: next.credentialVersion },
        now,
      });
      return Response.json({
        ok: true,
        connector: publicConnectorStatus(next),
        credential: secret.credential,
      });
    }

    if (["enable", "disable"].includes(action)) {
      const enabled = action === "enable";
      const next = {
        ...current,
        isEnabled: enabled,
        status: enabled ? "offline" : "disabled",
        disabledAt: enabled ? null : now,
        disabledBy: enabled ? null : actor,
        updatedAt: now,
      };
      await adminPatchDocument(CONNECTOR_COLLECTION, existingRow.id, next);
      await writeConnectorAudit({
        action: enabled ? "sage50_connector_enabled" : "sage50_connector_disabled",
        actor,
        connector: next,
        now,
      });
      return Response.json({ ok: true, connector: publicConnectorStatus(next) });
    }

    return jsonError("Unsupported connector action.", 400);
  } catch (error) {
    console.error("[sage50 connector management]", error);
    return jsonError(error?.message || "Connector management failed.", 500);
  }
}
