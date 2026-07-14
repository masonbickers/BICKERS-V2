const clean = (value) => String(value || "").trim();

export function storagePathFromDownloadUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/o\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function assetRef(source = {}) {
  const storagePath = clean(
    source.storagePath ||
      source.path ||
      source.quoteStoragePath ||
      source.pdfStoragePath ||
      storagePathFromDownloadUrl(source.url || source.quoteUrl || source.pdfUrl)
  );
  if (!storagePath) return null;
  return {
    storagePath,
    name: clean(source.name || source.fileName || storagePath.split("/").pop()),
    size: Math.max(0, Number(source.size || 0)),
    contentType: clean(source.contentType || source.type),
  };
}

export function deriveQuoteAssets(booking = {}, quoteVersion = {}) {
  const versions = Array.isArray(booking.quoteVersions) ? booking.quoteVersions.filter(Boolean) : [];
  const directSources = [
    ...(Array.isArray(quoteVersion.assetRefs) ? quoteVersion.assetRefs : []),
    quoteVersion,
  ];
  const quoteAttachments = (Array.isArray(booking.attachments) ? booking.attachments : [])
    .filter((attachment) => attachment?.folder === "quotes");
  if (versions.length === 1) directSources.push(...quoteAttachments, { quoteUrl: booking.quoteUrl });

  const seen = new Set();
  const assetRefs = directSources
    .map(assetRef)
    .filter((asset) => {
      if (!asset || seen.has(asset.storagePath)) return false;
      seen.add(asset.storagePath);
      return true;
    });
  const hasAmbiguousAssets = versions.length > 1 && (
    quoteAttachments.length > 0 || clean(booking.quoteUrl)
  );
  return {
    assetRefs,
    assetResolutionStatus: assetRefs.length
      ? "derived"
      : hasAmbiguousAssets
        ? "manual-review"
        : "none",
  };
}
