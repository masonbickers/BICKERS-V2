import {
  adminCommitDocumentPatches,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import {
  canAccessReceiptCompany,
  companyReceiptRows,
  receiptActor,
  requireReceiptFinance,
} from "@/app/api/receipts/_lib";
import { normalizeReceiptStatus } from "@/app/utils/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const { receiptId } = await params;
    const access = await requireReceiptFinance(request);
    if (access.error) return access.error;
    const receipt = await adminReadDocument("receipts", receiptId);
    if (!receipt) return jsonError("Receipt not found.", 404);
    if (!canAccessReceiptCompany(access.userData, receipt.companyId)) return jsonError("Company access denied.", 403);
    const group = await adminReadDocument("receiptGroups", receipt.groupId);
    if (!group) return jsonError("Receipt group not found.", 409);
    if (group.status === "closed") return jsonError("Reopen the group before changing a receipt.", 409);
    if (!["submitted", "action_required"].includes(group.status)) return jsonError("The month must be submitted before finance review.", 409);

    const body = await request.json().catch(() => ({}));
    const action = normalizeReceiptStatus(body.action);
    if (!["checked", "queried", "vat_claimed", "no_vat"].includes(action)) return jsonError("Invalid review action.", 400);
    const queryNote = String(body.queryNote || "").trim();
    const vatPence = Number(body.vatPence);
    if (action === "queried" && !queryNote) return jsonError("Enter a query reason.", 400);
    if (["checked", "vat_claimed"].includes(action) && (!Number.isInteger(vatPence) || vatPence < 0)) return jsonError("Enter a valid VAT amount.", 400);
    if (action === "vat_claimed" && vatPence <= 0) return jsonError("Use No VAT when no VAT is reclaimable.", 400);

    const actor = receiptActor(access);
    const now = new Date().toISOString();
    const receiptPatch = {
      status: action,
      vatPence: action === "no_vat" ? 0 : (["checked", "vat_claimed"].includes(action) ? vatPence : Number(receipt.vatPence || 0)),
      reviewedAt: now,
      reviewedByUid: actor.uid,
      reviewedByName: actor.name,
      updatedAt: now,
      ...(action === "queried" ? { queryNote, queriedAt: now, queriedByUid: actor.uid, queriedByName: actor.name } : {}),
    };
    const companyRows = await companyReceiptRows(receipt.companyId);
    const remainingQueried = companyRows.some((row) => row.groupId === receipt.groupId && row.id !== receiptId && normalizeReceiptStatus(row.status) === "queried");
    const groupPatch = action === "queried"
      ? { status: "action_required", updatedAt: now }
      : group.status === "action_required" && !remainingQueried
        ? { status: "submitted", updatedAt: now }
        : null;
    const writes = [{ collection: "receipts", documentId: receiptId, patch: receiptPatch }];
    if (groupPatch) writes.push({ collection: "receiptGroups", documentId: receipt.groupId, patch: groupPatch });
    await adminCommitDocumentPatches(writes);
    return Response.json({ ok: true, receipt: { id: receiptId, ...receipt, ...receiptPatch } });
  } catch (error) {
    console.error("Receipt review failed:", error);
    return jsonError(error?.message || "Receipt could not be reviewed.", 500);
  }
}
