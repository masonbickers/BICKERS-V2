import {
  adminDownloadStorageObject,
  adminReadDocumentWithMetadata,
} from "../../../_firebaseAdminRest.js";
import {
  canAccessCompany,
  jsonError,
  requireFinanceFromRequest,
} from "../../../admin/_lib.js";
import { ensureIssuedInvoiceDocument } from "../../../../utils/issuedInvoiceDocumentService.js";

export const runtime = "nodejs";

const text = (value) => String(value ?? "").trim();
const safeId = (value) => {
  const id = text(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

async function authorisedInvoice(req, context) {
  const auth = await requireFinanceFromRequest(req);
  if (auth.error) return { response: auth.error };
  const { id: rawId } = await context.params;
  const invoiceId = safeId(rawId);
  if (!invoiceId) return { response: jsonError("Valid invoice ID is required.", 400) };
  const invoiceSnapshot = await adminReadDocumentWithMetadata("invoiceQueue", invoiceId);
  if (!invoiceSnapshot) return { response: jsonError("Invoice not found.", 404) };
  if (!canAccessCompany(auth.userData, invoiceSnapshot.data.companyId)) {
    return { response: jsonError("Invoice company access denied.", 403) };
  }
  return { auth, invoiceId, invoiceSnapshot };
}

export async function POST(req, context) {
  try {
    const access = await authorisedInvoice(req, context);
    if (access.response) return access.response;
    const result = await ensureIssuedInvoiceDocument({
      invoiceId: access.invoiceId,
      invoiceSnapshot: access.invoiceSnapshot,
      actor: {
        uid: access.auth.verifiedUser.uid,
        email: access.auth.verifiedUser.email,
        role: access.auth.userData.role,
      },
    });
    return Response.json({ ok: true, idempotent: result.idempotent, document: result.metadata });
  } catch (error) {
    console.error("[issued invoice document generation]", error);
    const message = error?.message || "Could not generate the issued invoice document.";
    return jsonError(message, /only|required|incomplete|not found/i.test(message) ? 400 : 409);
  }
}

export async function GET(req, context) {
  try {
    const access = await authorisedInvoice(req, context);
    if (access.response) return access.response;
    const invoice = access.invoiceSnapshot.data;
    if (invoice.status !== "issued" || !invoice.issuedSnapshot) {
      return jsonError("Only issued invoices have a final document.", 409);
    }
    const metadata = invoice.issuedDocument;
    if (!metadata || metadata.status !== "stored" || !text(metadata.storagePath)) {
      return jsonError("The final issued invoice document has not been generated.", 409);
    }
    const pdf = await adminDownloadStorageObject(metadata.storagePath);
    if (!pdf) return jsonError("The stored issued invoice document is missing.", 410);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = text(metadata.filename) || `invoice-${text(invoice.invoiceNumber)}.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        ETag: `"${text(metadata.sha256)}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Invoice-Document-SHA256": text(metadata.sha256),
      },
    });
  } catch (error) {
    console.error("[issued invoice document download]", error);
    return jsonError(error?.message || "Could not load the issued invoice document.", 409);
  }
}
