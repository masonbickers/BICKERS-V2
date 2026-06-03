"use client";

import { collection, query, where } from "firebase/firestore";
import { normalizePlatformRole } from "@/app/utils/accessControl";
import {
  isPermissionDeniedError,
  reportPagePermissionDenied,
} from "@/app/utils/pageAccessEvents";

export function isPlatformAdminRole(role) {
  return normalizePlatformRole(role) === "platformAdmin";
}

export function resolveDataAccess(authState = {}, options = {}) {
  const requireCompany = options.requireCompany !== false;
  const allowPlatformWide = options.allowPlatformWide !== false;
  const user = authState?.user || null;
  const userDoc = authState?.userDoc || {};
  const role = normalizePlatformRole(userDoc?.role);
  const companyId = String(userDoc?.companyId || "").trim();
  const isPlatformAdmin = role === "platformAdmin";

  if (!authState?.accessReady) {
    return {
      allowed: false,
      checking: true,
      reason: "Account access is still loading.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (!user) {
    return {
      allowed: false,
      checking: false,
      reason: "Sign in is required.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (authState?.isEnabled === false || userDoc?.isEnabled === false) {
    return {
      allowed: false,
      checking: false,
      reason: "Account disabled.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (requireCompany && !isPlatformAdmin && !companyId) {
    return {
      allowed: false,
      checking: false,
      reason: "This account is missing a companyId.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (requireCompany && isPlatformAdmin && !allowPlatformWide && !companyId) {
    return {
      allowed: false,
      checking: false,
      reason: "Choose a company before creating company data.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  return {
    allowed: true,
    checking: false,
    reason: "",
    role,
    companyId,
    isPlatformAdmin,
  };
}

export function createDataAccessError(reason) {
  const error = new Error(reason || "Missing or insufficient permissions.");
  error.code = "permission-denied";
  return error;
}

export function reportDataAccessBlocked(gate, { collectionName = "", operation = "Firestore access" } = {}) {
  if (!gate || gate.checking || gate.allowed) return false;
  reportPagePermissionDenied({
    collectionName,
    operation,
    error: createDataAccessError(gate.reason),
  });
  return true;
}

export function handleFirestoreAccessError(
  error,
  { collectionName = "", operation = "Firestore access" } = {}
) {
  if (!isPermissionDeniedError(error)) return false;
  reportPagePermissionDenied({ collectionName, operation, error });
  return true;
}

export function tenantCollectionQuery(db, collectionName, authState, constraints = [], options = {}) {
  const gate = resolveDataAccess(authState, options);
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  const ref = collection(db, collectionName);
  const queryConstraints = Array.isArray(constraints) ? constraints : [];

  if (gate.isPlatformAdmin && options.platformWide !== false) {
    return queryConstraints.length ? query(ref, ...queryConstraints) : ref;
  }

  return query(ref, where("companyId", "==", gate.companyId), ...queryConstraints);
}

export function tenantPayload(authState, payload = {}, options = {}) {
  const gate = resolveDataAccess(authState, {
    ...options,
    allowPlatformWide: false,
  });
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  const incomingCompanyId = String(payload?.companyId || "").trim();
  const companyId = incomingCompanyId || gate.companyId;
  if (!companyId) throw createDataAccessError("Company data must include a companyId.");

  return {
    ...payload,
    companyId,
  };
}

export function dataAccessKey(authState = {}) {
  const userDoc = authState?.userDoc || {};
  return [
    authState?.accessReady ? "ready" : "loading",
    authState?.user?.uid || "",
    authState?.isEnabled === false ? "disabled" : "enabled",
    normalizePlatformRole(userDoc?.role),
    String(userDoc?.companyId || "").trim(),
  ].join(":");
}
