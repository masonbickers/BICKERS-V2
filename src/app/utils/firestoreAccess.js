"use client";

import { useMemo } from "react";
import { collection, query } from "firebase/firestore";
import { useAuth } from "@/app/context/authContext";
import { normalizePlatformRole } from "@/app/utils/accessControl";
import {
  isPermissionDeniedError,
} from "@/app/utils/pageAccessEvents";

export function isPlatformAdminRole(role) {
  return normalizePlatformRole(role) === "platformAdmin";
}

export const TENANT_COLLECTIONS = new Set([
  "bookings",
  "clients",
  "clientEmails",
  "deletedBookings",
  "employees",
  "equipment",
  "holidays",
  "jobSheets",
  "notes",
  "recces",
  "shiftChangeRequests",
  "maintenance",
  "maintenanceBookings",
  "maintenanceJobs",
  "motPreChecks",
  "serviceRecords",
  "defectReports",
  "defects",
  "vehicleChecks",
  "vehicleIssues",
  "vehicleUsageNotes",
  "vehiclePrepRecords",
  "workBookings",
  "timesheets",
  "timesheetQueries",
  "contacts",
  "invoiceQueue",
  "sickLeave",
  "uCraneFreelancers",
  "lorries",
  "vehicles",
  "hsRegister",
  "hrDocuments",
  "hsCheckRecords",
  "ppeIssueRecords",
  "employeeTrainingRecords",
]);

function currentCompanyId(authState = {}) {
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

  const archivedOrDisabled =
    authState?.isEnabled === false ||
    userDoc?.isEnabled === false ||
    userDoc?.disabled === true ||
    userDoc?.archived === true ||
    userDoc?.isArchived === true ||
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

  const ref = collection(db, collectionName);
  const queryConstraints = Array.isArray(constraints) ? constraints : [];

  // Single-company quick fix: auth/enabled-user security stays in rules; companyId filtering is disabled.
  reportTenantQueryDebug({
    authState,
    collectionName,
    companyId: currentCompanyId(authState),
    tenantFilterApplied: false,
  });
  return queryConstraints.length ? query(ref, ...queryConstraints) : ref;
}

export function emergencyBroadCollectionRef(db, collectionName, authState, operation = "Firestore broad read") {
  const gate = resolveDataAccess(authState);
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  if (typeof window !== "undefined") {
    // TEMPORARY EMERGENCY READ FALLBACK - REMOVE AFTER TENANT QUERY MIGRATION
    console.warn("[emergency-broad-read-fallback]", {
      uid: authState?.user?.uid || "",
      companyId: currentCompanyId(authState),
      collectionName,
      operation,
      tenantFilterApplied: false,
    });
  }

  return collection(db, collectionName);
}

export function tenantPayload(authState, payload = {}, options = {}) {
  const gate = resolveDataAccess(authState, {
    ...options,
    allowPlatformWide: false,
  });
  if (!gate.allowed) throw createDataAccessError(gate.reason);

  // Single-company quick fix: do not require/stamp companyId on writes.
  return { ...payload };
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
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
}
