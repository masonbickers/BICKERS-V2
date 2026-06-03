"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import {
  getStoredActiveWorkspace,
  isAdminPath,
  isModuleEnabledForPath,
  isPathAllowedForAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import { isMfaVerifiedOnDevice } from "@/app/utils/authSecurity";

const PUBLIC_PATHS = ["/login", "/setup-mfa", "/verify-mfa"];

const isPlatformControlPath = (pathname = "") => {
  const path = String(pathname || "").toLowerCase();
  return path === "/admin" || path.startsWith("/admin/") || path === "/platform-admin" || path.startsWith("/platform-admin/");
};

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    loading,
    accessReady,
    employeeAccess,
    featureFlags,
    isAdmin,
    isEnabled,
    phoneReady,
    mfaReady,
    mfaPassed,
  } = useAuth() || {};

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || String(pathname || "").startsWith(`${path}/`)
  );

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (!isPublic) router.push("/login");
      return;
    }

    if (isPublic) return;
    if (!accessReady || !employeeAccess) return;

    if (isEnabled === false) {
      router.replace("/login?disabled=1");
      return;
    }

    const hasCurrentMfaPass =
      mfaPassed ||
      isMfaVerifiedOnDevice(
        typeof window !== "undefined" ? window.localStorage : null,
        typeof window !== "undefined" ? window.sessionStorage : null,
        user.uid
      );

    if (!phoneReady || !mfaReady) {
      if (pathname !== "/setup-mfa") router.replace("/setup-mfa");
      return;
    }

    if (!hasCurrentMfaPass) {
      if (pathname !== "/verify-mfa") router.replace("/verify-mfa");
      return;
    }

    if (isAdminPath(pathname) && !isAdmin) {
      router.replace(selectLandingRoute(employeeAccess));
      return;
    }

    if (!isPathAllowedForAccess(pathname, employeeAccess)) {
      const preferred =
        typeof window !== "undefined"
          ? getStoredActiveWorkspace(window.localStorage) ||
            getStoredActiveWorkspace(window.sessionStorage)
          : null;
      router.replace(selectLandingRoute(employeeAccess, preferred));
      return;
    }

    if (!isPlatformControlPath(pathname) && !isModuleEnabledForPath(pathname, featureFlags)) {
      router.replace(selectLandingRoute(employeeAccess));
    }
  }, [
    loading,
    user,
    isPublic,
    accessReady,
    employeeAccess,
    featureFlags,
    isAdmin,
    isEnabled,
    phoneReady,
    mfaReady,
    mfaPassed,
    pathname,
    router,
  ]);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  if (user && !isPublic && !accessReady) {
    return <div style={{ padding: "20px" }}>Loading security check...</div>;
  }

  return <>{children}</>;
}
