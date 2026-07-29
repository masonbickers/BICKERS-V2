import {
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest.js";
import {
  canAccessCompany,
  jsonError,
  requireActiveUserFromRequest,
} from "../../../admin/_lib.js";
import {
  createSage50ExportJob,
} from "../../../../utils/sage50ConnectorContract.js";
import {
  createExportQueueRecord,
  exportJobDocumentId,
  publicExportJobStatus,
} from "../../../../utils/sage50ExportQueue.js";
import { publicConnectorStatus } from "../../../../utils/sage50ConnectorIdentity.js";
import {
  findTenantConnector,
  resolveManagedTenant,
} from "../connectors/_lib.js";
import {
  EXPORT_JOB_COLLECTION,
  writeExportJobAudit,
} from "./_lib.js";

export const runtime = "nodejs";

const text = (value) => String(value || "").trim();

export async function GET(req) {
  try {
    const auth = await requireActiveUserFromRequest(req, { module: "finance" });
    if (auth.error) return auth.error;
    const requestUrl = new URL(req.url);
    const companyId = await resolveManagedTenant(auth, requestUrl.searchParams.get("tenantId"));
    const invoiceId = text(requestUrl.searchParams.get("invoiceId"));
    const rows = await adminListDocuments(EXPORT_JOB_COLLECTION, { maxDocuments: 500 });
    return Response.json({
      ok: true,
      jobs: rows
        .filter(({ data }) =>
          data.tenantId === companyId && (!invoiceId || data.invoiceId === invoiceId)
        )
        .map(({ id, data }) => ({ queueJobId: id, ...publicExportJobStatus(data) }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    });
  } catch (error) {
    return jsonError(error?.message || "Could not read export jobs.", 500);
  }
}

export async function POST(req) {
  try {
    const auth = await requireActiveUserFromRequest(req, { module: "finance" });
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const invoiceId = text(body.invoiceId);
    if (!invoiceId || invoiceId.includes("/") || invoiceId.length > 180) {
      return jsonError("Valid invoice ID is required.", 400);
    }
    const invoice = await adminReadDocument("invoiceQueue", invoiceId);
    if (!invoice) return jsonError("Invoice not found.", 404);
    const tenantId = text(invoice.companyId);
    if (!tenantId || !canAccessCompany(auth.userData, tenantId)) {
      return jsonError("Invoice company access denied.", 403);
    }
    const connectorRow = await findTenantConnector(tenantId);
    const connectorStatus = connectorRow ? publicConnectorStatus(connectorRow.data) : null;
    if (
      !connectorRow ||
      connectorStatus.status !== "online" ||
      !connectorStatus.connectorVersion ||
      !connectorStatus.sageVersion ||
      !connectorStatus.sdoVersion
    ) {
      return jsonError("An online, version-reported Sage 50 connector is required.", 409);
    }
    const actor = auth.verifiedUser.email || auth.verifiedUser.uid || "Authenticated finance user";
    const now = new Date().toISOString();
    const contract = createSage50ExportJob({
      invoice,
      tenantId,
      requestedBy: actor,
      requestedAt: now,
    });
    const documentId = exportJobDocumentId(contract.idempotencyKey);
    const existing = await adminReadDocument(EXPORT_JOB_COLLECTION, documentId);
    if (existing) {
      return Response.json({ ok: true, created: false, job: { queueJobId: documentId, ...publicExportJobStatus(existing) } });
    }
    const record = createExportQueueRecord({
      contract,
      connectorId: connectorRow.data.connectorId,
      now,
    });
    try {
      await adminPatchDocument(EXPORT_JOB_COLLECTION, documentId, record, { mustNotExist: true });
    } catch (error) {
      const raced = await adminReadDocument(EXPORT_JOB_COLLECTION, documentId);
      if (raced) {
        return Response.json({ ok: true, created: false, job: { queueJobId: documentId, ...publicExportJobStatus(raced) } });
      }
      throw error;
    }
    await writeExportJobAudit({
      action: "sage50_export_job_queued",
      actor: { uid: auth.verifiedUser.uid, email: auth.verifiedUser.email, role: auth.userData.role },
      job: record,
      details: { invoiceId, connectorId: record.connectorId },
      now,
    });
    return Response.json({ ok: true, created: true, job: { queueJobId: documentId, ...publicExportJobStatus(record) } }, { status: 201 });
  } catch (error) {
    console.error("[sage50 export queue]", error);
    return jsonError(error?.message || "Could not queue invoice export.", 400);
  }
}
