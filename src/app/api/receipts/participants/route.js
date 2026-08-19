import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import {
  activeReceiptParticipant,
  receiptCompanyId,
  requireReceiptFinance,
} from "@/app/api/receipts/_lib";
import { dedupeReceiptParticipants } from "@/app/utils/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const access = await requireReceiptFinance(request);
    if (access.error) return access.error;
    const url = new URL(request.url);
    const companyId = String(url.searchParams.get("companyId") || receiptCompanyId(access.userData));
    const [documents, employeeDocuments] = await Promise.all([
      adminListDocuments("users"),
      adminListDocuments("employees"),
    ]);
    const preferredUidByEmployeeId = new Map(
      employeeDocuments
        .map(({ id, data = {} }) => [String(id || "").trim(), String(data.authUid || data.uid || "").trim()])
        .filter(([employeeId, uid]) => employeeId && uid)
    );
    const participants = dedupeReceiptParticipants(documents
      .map((row) => ({ id: row.id, ...(row.data || {}) }))
      .filter((row) => activeReceiptParticipant(row, companyId)), { preferredUidByEmployeeId });
    return Response.json({ companyId, participants });
  } catch (error) {
    console.error("Receipt participants load failed:", error);
    return jsonError("Could not load receipt participants.", 500);
  }
}
