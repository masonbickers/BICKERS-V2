export function normalizeVehicleAssetNumber(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";
  return /^\d{1,4}$/.test(cleaned) ? cleaned.padStart(4, "0") : cleaned;
}

export function syncVehicleAssetNumberAliases(record = {}) {
  const assetNumber = normalizeVehicleAssetNumber(
    record.assetNumber || record.sageAssetNumber
  );
  return {
    assetNumber,
    sageAssetNumber: assetNumber,
  };
}
