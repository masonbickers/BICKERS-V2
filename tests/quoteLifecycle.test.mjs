import test from "node:test";
import assert from "node:assert/strict";
import { buildQuoteDeletion, purgeAfterIso, purgeQuoteTombstone, restoreQuoteVersion } from "../src/app/api/quotes/_lifecycle.js";

const booking = {
  acceptedQuoteNumber: "Q2",
  quoteVersions: [
    { quoteNumber: "Q1", version: 1, savedAt: "2026-01-01T00:00:00.000Z" },
    { quoteNumber: "Q2", version: 2, savedAt: "2026-02-01T00:00:00.000Z", assetRefs: [{ storagePath: "companies/bickers-action/quotes/q2.pdf" }] },
  ],
};

test("quote deletion removes one version, clears acceptance, and preserves asset refs", () => {
  const result = buildQuoteDeletion(booking, "q2");
  assert.equal(result.patch.quoteVersions.length, 1);
  assert.equal(result.patch.acceptedQuoteNumber, "");
  assert.equal(result.target.assetRefs[0].storagePath, "companies/bickers-action/quotes/q2.pdf");
});

test("quote restore rejects duplicates and restores a deleted version", () => {
  const deletion = buildQuoteDeletion(booking, "Q2");
  const restored = restoreQuoteVersion({ quoteVersions: deletion.patch.quoteVersions }, deletion.target);
  assert.equal(restored.quoteVersions.length, 2);
  assert.throws(() => restoreQuoteVersion(booking, deletion.target), /already exists/);
});

test("purge deadline is exactly thirty calendar days in milliseconds", () => {
  const start = Date.parse("2026-07-14T12:00:00.000Z");
  assert.equal(purgeAfterIso(start), "2026-08-13T12:00:00.000Z");
});

test("partial purge failure remains retryable and a retry removes the tombstone", async () => {
  const deleted = [];
  const failurePatches = [];
  let tombstoneDeleted = false;
  let failSecondAsset = true;
  const tombstone = {
    companyId: "bickers-action",
    purgeAttempts: 1,
    assetRefs: [
      { storagePath: "companies/bickers-action/quotes/a.pdf" },
      { storagePath: "companies/bickers-action/quotes/b.pdf" },
    ],
  };
  const run = () => purgeQuoteTombstone({
    id: "deleted-1",
    tombstone,
    deleteAsset: async (storagePath) => {
      if (storagePath.endsWith("b.pdf") && failSecondAsset) throw new Error("temporary storage failure");
      deleted.push(storagePath);
    },
    deleteTombstone: async () => { tombstoneDeleted = true; },
    markFailure: async (patch) => { failurePatches.push(patch); },
  });

  const first = await run();
  assert.equal(first.purged, false);
  assert.equal(tombstoneDeleted, false);
  assert.equal(failurePatches[0].purgeAttempts, 2);
  failSecondAsset = false;
  const retry = await run();
  assert.equal(retry.purged, true);
  assert.equal(tombstoneDeleted, true);
  assert.ok(deleted.includes("companies/bickers-action/quotes/b.pdf"));
});

test("purge rejects legacy or cross-company asset paths", async () => {
  let failure;
  const result = await purgeQuoteTombstone({
    id: "unsafe",
    tombstone: { companyId: "bickers-action", assetRefs: [{ storagePath: "quotes/legacy.pdf" }] },
    deleteAsset: async () => assert.fail("unsafe asset must not be deleted"),
    deleteTombstone: async () => assert.fail("unsafe tombstone must remain"),
    markFailure: async (patch) => { failure = patch; },
  });
  assert.equal(result.purged, false);
  assert.match(failure.purgeError, /Unsafe or legacy/);
});
