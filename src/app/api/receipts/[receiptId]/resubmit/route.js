import {
  adminCommitDocumentPatches,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import {
  canAccessReceiptCompany,
  companyReceiptRows,
  receiptActor,
  requireReceiptUser,
} from "@/app/api/receipts/_lib";
import { normalizeReceiptStatus, suggestedVatPence } from "@/app/utils/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const { receiptId } = await params;
    const access = await requireReceiptUser(request);
    if (access.error) return access.error;
    const receipt = await adminReadDocument("receipts", receiptId);
    if (!receipt) return jsonError("Receipt not found.", 404);
    const actor = receiptActor(access);
    if (receipt.submitterUid !== actor.uid) return jsonError("Only the receipt owner can resubmit it.", 403);
    if (!canAccessReceiptCompany(access.userData, receipt.companyId)) return jsonError("Company access denied.", 403);
    if (normalizeReceiptStatus(receipt.status) !== "queried") return jsonError("Only queried receipts can be resubmitted.", 409);
    const group = await adminReadDocument("receiptGroups", receipt.groupId);
    if (!group || group.status !== "action_required") return jsonError("This receipt group is not awaiting corrections.", 409);

    const body = await request.json().catch(() => ({}));
    const purpose = String(body.purpose || "").trim();
    const valuePence = Number(body.valuePence);
    if (!purpose) return jsonError("Enter what the receipt is for.", 400);
    if (!Number.isInteger(valuePence) || valuePence <= 0) return jsonError("Enter a valid receipt value.", 400);
    const expectedPrefix = `companies/${receipt.companyId}/receipts/${actor.uid}/${receiptId}/`;
    const storagePath = String(body.storagePath || receipt.storagePath || "");
    if (!storagePath.startsWith(expectedPrefix)) return jsonError("Invalid receipt file path.", 400);
    const now = new Date().toISOString();
    const receiptPatch = {
      purpose,
      valuePence,
      suggestedVatPence: suggestedVatPence(valuePence),
      status: "pending",
      storagePath,
      fileName: String(body.fileName || receipt.fileName || "receipt"),
      fileType: String(body.fileType || receipt.fileType || "application/octet-stream"),
      fileSize: Number(body.fileSize || receipt.fileSize || 0),
      resubmittedAt: now,
      resubmittedByUid: actor.uid,
      queryResolvedAt: now,
      updatedAt: now,
    };
    const rows = await companyReceiptRows(receipt.companyId);
    const remainingQueried = rows.some((row) => row.groupId === receipt.groupId && row.id !== receiptId && normalizeReceiptStatus(row.status) === "queried");
    const writes = [{ collection: "receipts", documentId: receiptId, patch: receiptPatch }];
    if (!remainingQueried) writes.push({ collection: "receiptGroups", documentId: receipt.groupId, patch: { status: "submitted", updatedAt: now } });
    await adminCommitDocumentPatches(writes);
    return Response.json({ ok: true, receipt: { id: receiptId, ...receipt, ...receiptPatch } });
  } catch (error) {
    console.error("Receipt resubmission failed:", error);
    return jsonError(error?.message || "Receipt could not be resubmitted.", 500);
  }
}
