import "server-only";

import {
  adminListCollectionGroupDocuments,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  filterDocsForAdminCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import { acceptanceMatchesEmployee } from "@/app/utils/workingTermsRecords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeId = (value) => {
  const id = String(value || "").trim();
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

const redactAcceptance = ({ signatureSvgPath: _signatureSvgPath, ...record }) => record;

export async function GET(req) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (auth.error) return auth.error;

    const requestedEmployeeId = safeId(new URL(req.url).searchParams.get("employeeId"));
    const records = filterDocsForAdminCompany(
      await adminListCollectionGroupDocuments("versions", { maxDocuments: 3000 }),
      auth.userData
    )
      .filter(({ data }) => data?.documentTitle === "Bickers Action Working Terms" && data?.accepted === true)
      .map(({ id, parentId, data }) => ({ id, uid: parentId, ...data }));

    if (!requestedEmployeeId) {
      return Response.json({ records: records.map(redactAcceptance) });
    }

    const employee = await adminReadDocument("employees", requestedEmployeeId);
    if (!employee) return jsonError("Employee not found.", 404);
    if (!canAccessCompany(auth.userData, employee.companyId)) {
      return jsonError("Employee company access denied.", 403);
    }

    const employeeRecord = { id: requestedEmployeeId, ...employee };
    return Response.json({
      records: records.filter((record) => acceptanceMatchesEmployee(record, employeeRecord)),
    });
  } catch (error) {
    console.error("[working terms records]", error);
    return jsonError("Working Terms records could not be loaded.", 500);
  }
}
