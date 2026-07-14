"use client";

import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import { useAuth } from "@/app/context/authContext";
import { normalizePlatformRole } from "@/app/utils/accessControl";
import {
  isPermissionDeniedError,
} from "@/app/utils/pageAccessEvents";
import { TENANT_COLLECTIONS } from "@/app/config/tenantCollections";

export function isPlatformAdminRole(role) {
  return normalizePlatformRole(role) === "platformAdmin";
}

export { TENANT_COLLECTIONS };

export function currentCompanyId(authState = {}) {
  return String(authState?.userDoc?.companyId || "").trim();
}

function reportTenantQueryDebug({ authState, collectionName, companyId, tenantFilterApplied }) {
  if (typeof window === "undefined") return;
  console.log("[tenant-query]", {
    uid: authState?.user?.uid || "",
    companyId,
    collectionName,
    tenantFilterApplied,
  });
}

export function resolveDataAccess(authState = {}, options = {}) {
  const userDoc = authState?.userDoc || {};
  const role = normalizePlatformRole(userDoc?.role);
  const companyId = currentCompanyId(authState);
  const isPlatformAdmin = role === "platformAdmin";

  if (authState?.loading === true || authState?.accessReady === false) {
    return {
      allowed: false,
      checking: true,
      reason: "Loading account access.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (!authState?.user) {
    return {
      allowed: false,
      checking: false,
      reason: "Sign in required.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  const archivedOrDisabled =
    authState?.isEnabled !== true ||
    userDoc?.isEnabled !== true ||
    userDoc?.disabled === true ||
    userDoc?.archived === true ||
    userDoc?.isArchived === true ||
    userDoc?.credentialResetRequired === true ||
    String(userDoc?.role || "").trim().toLowerCase() === "archived";

  if (archivedOrDisabled) {
    return {
      allowed: false,
      checking: false,
      reason: "Account disabled.",
      role,
      companyId,
      isPlatformAdmin,
    };
  }

  if (!companyId) {
    return {
      allowed: false,
      checking: false,
      reason: "Company membership is required.",
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
  return false;
}

export function handleFirestoreAccessError(
  error,
  { collectionName = "", operation = "Firestore access" } = {}
) {
  if (!isPermissionDeniedError(error)) return false;
  console.warn(`${operation} unavailable for ${collectionName || "Firestore"}:`, error);
  return true;
}

export function tenantCollectionQuery(db, collectionName, authState, constraints = [], options = {}) {
  const gate = resolveDataAccess(authState, options);
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  if (!TENANT_COLLECTIONS.has(collectionName)) {
    throw createDataAccessError(`Collection ${collectionName} is not in the tenant manifest.`);
  }

  const ref = collection(db, collectionName);
  const queryConstraints = Array.isArray(constraints) ? constraints : [];
  const companyConstraint = where("companyId", "==", gate.companyId);

  reportTenantQueryDebug({
    authState,
    collectionName,
    companyId: gate.companyId,
    tenantFilterApplied: true,
  });
  return query(ref, companyConstraint, ...queryConstraints);
}

export function tenantPayload(authState, payload = {}, options = {}) {
  const gate = resolveDataAccess(authState, {
    ...options,
    allowPlatformWide: false,
  });
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  const incomingCompanyId = String(payload?.companyId || "").trim();
  if (incomingCompanyId && incomingCompanyId !== gate.companyId) {
    throw createDataAccessError("Cross-company writes are not allowed.");
  }
  const actorUid = String(authState?.user?.uid || "").trim();
  return {
    ...payload,
    companyId: gate.companyId,
    ...(!payload?.createdByUid && actorUid ? { createdByUid: actorUid } : {}),
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

export function useDataAccessState() {
  const authAccess = useAuth() || {};
  return useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      isAdmin: authAccess.isAdmin,
      loading: authAccess.loading,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isAdmin, authAccess.isEnabled, authAccess.loading, authAccess.user, authAccess.userDoc]
  );
}
