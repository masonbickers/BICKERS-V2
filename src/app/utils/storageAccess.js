"use client";

import { createDataAccessError, resolveDataAccess } from "@/app/utils/firestoreAccess";

export function companyStoragePath(authState, legacyPath) {
  const gate = resolveDataAccess(authState, { allowPlatformWide: false });
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  const cleanPath = String(legacyPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!cleanPath) throw createDataAccessError("Storage path is required.");

  if (cleanPath.startsWith("companies/")) return cleanPath;
  return `companies/${gate.companyId}/${cleanPath}`;
}
