const clean = (value) => String(value || "").trim();
export const quoteKey = (value) => clean(value).toLowerCase();

export function normalizeAssetRefs(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((asset) => ({
      storagePath: clean(asset?.storagePath || asset?.path),
      name: clean(asset?.name),
      size: Math.max(0, Number(asset?.size || 0)),
      contentType: clean(asset?.contentType || asset?.type),
    }))
    .filter((asset) => {
      if (!asset.storagePath || seen.has(asset.storagePath)) return false;
      seen.add(asset.storagePath);
      return true;
    });
}

export function latestQuoteVersion(versions = []) {
  return [...versions].sort((left, right) => {
    const leftTime = Date.parse(left?.savedAt || left?.updatedAt || left?.createdAt || "") || 0;
    const rightTime = Date.parse(right?.savedAt || right?.updatedAt || right?.createdAt || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return Number(right?.version || 0) - Number(left?.version || 0);
  })[0] || null;
}

export function buildQuoteDeletion(booking = {}, requestedQuoteNumber = "") {
  const versions = Array.isArray(booking.quoteVersions) ? booking.quoteVersions.filter(Boolean) : [];
  const targetKey = quoteKey(requestedQuoteNumber);
  const target = versions.find((version) => quoteKey(version?.quoteNumber) === targetKey);
  if (!target) throw new Error("Quote version was not found.");

  const remaining = versions.filter((version) => quoteKey(version?.quoteNumber) !== targetKey);
  const nextQuote = latestQuoteVersion(remaining);
  const quoteNumbers = [...new Set(remaining.map((version) => clean(version?.quoteNumber)).filter(Boolean))];
  const acceptedDeleted = quoteKey(booking.acceptedQuoteNumber) === targetKey;
  const patch = {
    quoteVersions: remaining,
    quoteNumbers,
    quote: nextQuote,
    quoteNumber: clean(nextQuote?.quoteNumber || quoteNumbers[0]),
    quoteVersion: Number(nextQuote?.version || 0),
    ...(acceptedDeleted ? { acceptedQuoteNumber: "", acceptedQuoteName: "" } : {}),
  };

  return { target: { ...target, assetRefs: normalizeAssetRefs(target.assetRefs) }, patch };
}

export function restoreQuoteVersion(booking = {}, quoteVersion = {}) {
  const versions = Array.isArray(booking.quoteVersions) ? booking.quoteVersions.filter(Boolean) : [];
  const restoredKey = quoteKey(quoteVersion.quoteNumber);
  if (versions.some((version) => quoteKey(version?.quoteNumber) === restoredKey)) {
    throw new Error("A quote with this number already exists on the booking.");
  }
  const nextVersions = [...versions, quoteVersion];
  const latest = latestQuoteVersion(nextVersions);
  return {
    quoteVersions: nextVersions,
    quoteNumbers: [...new Set(nextVersions.map((version) => clean(version?.quoteNumber)).filter(Boolean))],
    quote: latest,
    quoteNumber: clean(latest?.quoteNumber),
    quoteVersion: Number(latest?.version || 0),
  };
}

export const purgeAfterIso = (deletedAtMs = Date.now()) =>
  new Date(deletedAtMs + 30 * 24 * 60 * 60 * 1000).toISOString();

export async function purgeQuoteTombstone({
  id,
  tombstone,
  deleteAsset,
  deleteTombstone,
  markFailure,
  now = new Date().toISOString(),
}) {
  const requiredPrefix = `companies/${clean(tombstone?.companyId)}/`;
  try {
    for (const asset of normalizeAssetRefs(tombstone?.assetRefs)) {
      const storagePath = asset.storagePath.replace(/^\/+/, "");
      if (!clean(tombstone?.companyId) || !storagePath.startsWith(requiredPrefix)) {
        throw new Error(`Unsafe or legacy asset path: ${storagePath || "missing"}`);
      }
      await deleteAsset(storagePath);
    }
    await deleteTombstone();
    return { id, purged: true };
  } catch (error) {
    const message = error?.message || String(error);
    await markFailure({
      purgeAttempts: Number(tombstone?.purgeAttempts || 0) + 1,
      purgeError: message,
      purgeLastAttemptAt: now,
    });
    return { id, purged: false, error: message };
  }
}
