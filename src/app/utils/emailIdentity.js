export function formatEmailFrom(displayName, address) {
  const cleanAddress = String(address || "").trim();
  if (!cleanAddress || cleanAddress.includes("<")) return cleanAddress;
  const cleanName = String(displayName || "").replace(/[\r\n<>]/g, "").trim();
  return cleanName ? `${cleanName} <${cleanAddress}>` : cleanAddress;
}
