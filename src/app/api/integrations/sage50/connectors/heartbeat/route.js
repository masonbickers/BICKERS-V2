import {
  adminPatchDocument,
} from "../../../../_firebaseAdminRest.js";
import { sanitiseHeartbeat } from "../../../../../utils/sage50ConnectorIdentity.js";
import {
  authenticateConnector,
  CONNECTOR_COLLECTION,
  connectorError,
  writeConnectorAudit,
} from "../_lib.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const auth = await authenticateConnector(req);
    if (auth.error) return auth.error;
    const connector = auth.connector;
    const connectorId = connector.connectorId;

    const body = await req.json().catch(() => ({}));
    const heartbeat = sanitiseHeartbeat(body);
    const now = new Date().toISOString();
    const next = {
      ...connector,
      ...heartbeat,
      lastHeartbeatAt: now,
      updatedAt: now,
    };
    await adminPatchDocument(CONNECTOR_COLLECTION, connectorId, next);
    if (
      heartbeat.status !== "online" ||
      connector.status !== heartbeat.status ||
      connector.machineName !== heartbeat.machineName
    ) {
      await writeConnectorAudit({
        action: "sage50_connector_heartbeat_state_changed",
        connector: next,
        details: {
          previousStatus: connector.status || "offline",
          status: heartbeat.status,
          machineName: heartbeat.machineName,
        },
        now,
      });
    }
    return Response.json({
      ok: true,
      connectorId,
      status: heartbeat.status,
      serverTime: now,
      credentialVersion: Number(connector.credentialVersion || 0),
    });
  } catch (error) {
    console.error("[sage50 connector heartbeat]", error);
    return connectorError("Heartbeat failed.", 500);
  }
}
