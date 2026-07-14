import { requireAdminFromRequest } from "../../admin/_lib";
import { getAdminDb } from "../../_firebaseAdmin";

export async function GET(req) {
  const access = await requireAdminFromRequest(req);
  if (access.error) return access.error;
  const snapshot = await getAdminDb()
    .collection("deletedQuotes")
    .where("companyId", "==", access.companyId)
    .get();
  const rows = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
  return Response.json({ deletedQuotes: rows });
}
