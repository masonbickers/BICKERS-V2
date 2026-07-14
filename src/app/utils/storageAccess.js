"use client";

import { createDataAccessError, resolveDataAccess } from "@/app/utils/firestoreAccess";

export function companyStoragePath(authState, legacyPath) {
  const gate = resolveDataAccess(authState, { allowPlatformWide: false });
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  const cleanPath = String(legacyPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!cleanPath) throw createDataAccessError("Storage path is required.");

  const prefix = `companies/${gate.companyId}/`;
  if (cleanPath.startsWith("companies/") && !cleanPath.startsWith(prefix)) {
    throw createDataAccessError("Cross-company storage paths are not allowed.");
  }
  return cleanPath.startsWith(prefix) ? cleanPath : `${prefix}${cleanPath}`;
}
