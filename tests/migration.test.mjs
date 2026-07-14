import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCompany,
  collectLegacyStoragePaths,
  normalizeUserAccessRecord,
  rewriteStorageReferences,
} from "../scripts/lib/tenantMigration.mjs";
import { deriveQuoteAssets, storagePathFromDownloadUrl } from "../scripts/lib/quoteAssets.mjs";

test("company migration classifies missing, migrated, and conflicting records", () => {
  assert.equal(classifyCompany({}, "bickers-action"), "missing");
  assert.equal(classifyCompany({ companyId: "bickers-action" }, "bickers-action"), "target");
  assert.equal(classifyCompany({ companyId: "other" }, "bickers-action"), "conflict");
});

test("user migration supplies every required access field without overriding disabled state", () => {
  const user = normalizeUserAccessRecord({ email: "USER@BICKERS.CO.UK", active: false }, { id: "uid-1", companyId: "bickers-action" });
  assert.deepEqual(
    { uid: user.uid, email: user.email, companyId: user.companyId, isEnabled: user.isEnabled, role: user.role, appAccess: user.appAccess, defaultWorkspace: user.defaultWorkspace },
    { uid: "uid-1", email: "user@bickers.co.uk", companyId: "bickers-action", isEnabled: false, role: "user", appAccess: { user: true, service: false }, defaultWorkspace: "user" }
  );
});

test("storage reference migration is idempotent and handles nested records", () => {
  const input = { asset: { storagePath: "quotes/a.pdf" }, rows: [{ path: "vehicles/v1/a.jpg" }] };
  assert.deepEqual([...collectLegacyStoragePaths(input)].sort(), ["quotes/a.pdf", "vehicles/v1/a.jpg"]);
  const first = rewriteStorageReferences(input, "bickers-action");
  const second = rewriteStorageReferences(first, "bickers-action");
  assert.deepEqual(first, second);
  assert.equal(first.asset.storagePath, "companies/bickers-action/quotes/a.pdf");
});

test("quote asset backfill derives safe paths and flags ambiguous versions", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/demo/o/quotes%2F1001.xlsx?alt=media";
  assert.equal(storagePathFromDownloadUrl(url), "quotes/1001.xlsx");
  const single = deriveQuoteAssets({ quoteVersions: [{ quoteNumber: "1001" }], quoteUrl: url }, { quoteNumber: "1001" });
  assert.equal(single.assetRefs[0].storagePath, "quotes/1001.xlsx");
  const ambiguous = deriveQuoteAssets({ quoteVersions: [{ quoteNumber: "1" }, { quoteNumber: "2" }], quoteUrl: url }, { quoteNumber: "1" });
  assert.equal(ambiguous.assetResolutionStatus, "manual-review");
});
