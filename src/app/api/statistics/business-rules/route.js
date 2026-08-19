import { adminCreateDocument, adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { requireAdminFromRequest } from "@/app/api/admin/_lib";
import {
  DEFAULT_BICKERS_BUSINESS_RULES,
  mergeBickersBusinessRules,
  previewBookingInterpretation,
  validateBickersBusinessRules,
} from "@/app/utils/bickersBusinessRules";

const companyIdFor = (admin) => String(admin.userData?.companyId || "bickers-action").trim() || "bickers-action";

const responsePayload = async (companyId) => {
  const draft = await adminReadDocument("aiBusinessRules", `${companyId}_draft`);
  const published = await adminReadDocument("aiBusinessRules", `${companyId}_published`);
  const rules = mergeBickersBusinessRules(draft?.rules || published?.rules || DEFAULT_BICKERS_BUSINESS_RULES);
  return {
    companyId,
    draft: draft || { rules, status: "draft", version: Number(published?.version || 0) + 1 },
    published: published || null,
    validation: validateBickersBusinessRules(rules),
    preview: previewBookingInterpretation({ status: "Complete", jobNumber: "1234", bookingDates: ["2026-07-15"], hasQuote: true, hasHS: true }, rules),
  };
};

export async function GET(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  return Response.json(await responsePayload(companyIdFor(admin)));
}

export async function PATCH(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  const body = await req.json().catch(() => ({}));
  const companyId = companyIdFor(admin);
  const rules = mergeBickersBusinessRules(body.rules);
  const validation = validateBickersBusinessRules(rules);
  if (!validation.valid) return Response.json({ error: "Business rules are not valid.", validation }, { status: 400 });
  const published = await adminReadDocument("aiBusinessRules", `${companyId}_published`);
  const now = new Date().toISOString();
  await adminPatchDocument("aiBusinessRules", `${companyId}_draft`, {
    companyId,
    status: "draft",
    version: Number(published?.version || 0) + 1,
    rules,
    changeSummary: String(body.changeSummary || "Draft updated").trim().slice(0, 300),
    updatedAt: now,
    updatedBy: admin.verifiedUser.email,
    updatedByUid: admin.verifiedUser.uid,
  });
  return Response.json(await responsePayload(companyId));
}

export async function POST(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;
  const companyId = companyIdFor(admin);
  const body = await req.json().catch(() => ({}));
  const draft = await adminReadDocument("aiBusinessRules", `${companyId}_draft`);
  const rules = mergeBickersBusinessRules(body.rules || draft?.rules);
  const validation = validateBickersBusinessRules(rules);
  if (!validation.valid) return Response.json({ error: "Business rules are not valid.", validation }, { status: 400 });
  const current = await adminReadDocument("aiBusinessRules", `${companyId}_published`);
  const version = Number(current?.version || 0) + 1;
  const now = new Date().toISOString();
  const document = {
    companyId,
    status: "published",
    version,
    rules,
    changeSummary: String(body.changeSummary || draft?.changeSummary || "Business rules published").trim().slice(0, 300),
    publishedAt: now,
    publishedBy: admin.verifiedUser.email,
    publishedByUid: admin.verifiedUser.uid,
  };
  await adminPatchDocument("aiBusinessRules", `${companyId}_published`, document);
  await adminPatchDocument("aiBusinessRules", `${companyId}_v${version}`, document);
  await adminPatchDocument("aiBusinessRules", `${companyId}_draft`, {
    ...document,
    status: "draft",
    version: version + 1,
    updatedAt: now,
    updatedBy: admin.verifiedUser.email,
    updatedByUid: admin.verifiedUser.uid,
  });
  await adminCreateDocument("adminAuditLogs", {
    action: "ai-business-rules-published",
    companyId,
    version,
    actorUid: admin.verifiedUser.uid,
    actorEmail: admin.verifiedUser.email,
    createdAt: now,
  });
  return Response.json(await responsePayload(companyId));
}
