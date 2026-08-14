import {
  adminCommitDocumentPatches,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import {
  canAccessReceiptCompany,
  companyReceiptRows,
  isReceiptFinanceUser,
  receiptActor,
  receiptCompanyId,
  requireReceiptUser,
} from "@/app/api/receipts/_lib";
import {
  canCloseReceiptGroup,
  isSelectableReceiptMonth,
  receiptGroupId,
} from "@/app/utils/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const { groupId } = await params;
    const access = await requireReceiptUser(request);
    if (access.error) return access.error;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const finance = isReceiptFinanceUser(access.userData);
    const actor = receiptActor(access);
    let group = await adminReadDocument("receiptGroups", groupId);

    if (!group) {
      if (!["submit", "declare_none"].includes(action)) return jsonError("Receipt group not found.", 404);
      const companyId = String(body.companyId || receiptCompanyId(access.userData));
      const submitterUid = String(body.submitterUid || actor.uid);
      const monthKey = String(body.monthKey || "");
      if (!isSelectableReceiptMonth(monthKey)) return jsonError("Choose a current or previous month.", 400);
      if (receiptGroupId(companyId, submitterUid, monthKey) !== groupId) return jsonError("Invalid receipt group.", 400);
      if (!canAccessReceiptCompany(access.userData, companyId)) return jsonError("Company access denied.", 403);
      if (submitterUid !== actor.uid && !finance) return jsonError("You cannot submit another user's group.", 403);
      group = {
        companyId,
        submitterUid,
        submitterName: String(body.submitterName || actor.name),
        monthKey,
        status: "draft",
        declaredNoReceipts: false,
        createdAt: new Date().toISOString(),
      };
    }

    if (!canAccessReceiptCompany(access.userData, group.companyId)) return jsonError("Company access denied.", 403);
    const owner = group.submitterUid === actor.uid;
    if (!owner && !finance) return jsonError("Receipt group access denied.", 403);
    const receipts = (await companyReceiptRows(group.companyId)).filter((row) => row.groupId === groupId);
    const now = new Date().toISOString();
    let patch;
    let receiptPatches = [];

    if (action === "submit" || action === "declare_none") {
      if (!owner && !finance) return jsonError("Only the owner or finance can submit this group.", 403);
      if (group.status === "closed") return jsonError("Closed groups must be reopened first.", 409);
      if (receipts.some((row) => row.status === "queried")) return jsonError("Resolve queried receipts before submitting.", 409);
      if (action === "declare_none" && receipts.length) return jsonError("A group with receipts cannot be declared empty.", 409);
      if (action === "submit" && !receipts.length) return jsonError("Upload a receipt or declare no receipts.", 409);
      patch = {
        ...group,
        status: "submitted",
        declaredNoReceipts: action === "declare_none",
        submittedAt: now,
        submittedByUid: actor.uid,
        submittedByName: actor.name,
        updatedAt: now,
      };
    } else if (action === "reopen") {
      if (!finance) return jsonError("Finance access is required to reopen a group.", 403);
      if (group.status === "action_required") {
        return jsonError("Queried receipts are already open for the user to correct.", 409);
      }
      if (!["submitted", "closed"].includes(group.status)) {
        return jsonError("Only submitted or closed groups can be reopened.", 409);
      }
      patch = {
        status: "draft",
        declaredNoReceipts: false,
        reopenedAt: now,
        reopenedByUid: actor.uid,
        reopenedByName: actor.name,
        updatedAt: now,
      };
      receiptPatches = receipts.map((receipt) => ({
        collection: "receipts",
        documentId: receipt.id,
        patch: {
          status: "pending",
          vatPence: 0,
          reopenedAt: now,
          reopenedByUid: actor.uid,
          reopenedByName: actor.name,
          updatedAt: now,
        },
      }));
    } else if (action === "close") {
      if (!finance) return jsonError("Finance access is required to close a group.", 403);
      if (!canCloseReceiptGroup(group, receipts)) return jsonError("Resolve every receipt before closing this group.", 409);
      patch = {
        status: "closed",
        closedAt: now,
        closedByUid: actor.uid,
        closedByName: actor.name,
        updatedAt: now,
      };
    } else {
      return jsonError("Unknown receipt group action.", 400);
    }

    await adminCommitDocumentPatches([...receiptPatches, {
      collection: "receiptGroups",
      documentId: groupId,
      patch,
      ...(await adminReadDocument("receiptGroups", groupId) ? {} : { exists: false }),
    }]);
    return Response.json({ ok: true, group: { id: groupId, ...group, ...patch } });
  } catch (error) {
    console.error("Receipt group transition failed:", error);
    return jsonError(error?.message || "Receipt group could not be updated.", 500);
  }
}
