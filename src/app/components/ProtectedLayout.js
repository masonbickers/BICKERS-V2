"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import {
  getStoredActiveWorkspace,
  isAdminPath,
  isPathAllowedForAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";

const PUBLIC_PATHS = ["/login", "/setup-mfa", "/verify-mfa"];

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    loading,
    accessReady,
    employeeAccess,
    isAdmin,
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

    if (!phoneReady || !mfaReady) {
      if (pathname !== "/setup-mfa") router.replace("/setup-mfa");
      return;
    }

    if (!mfaPassed) {
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
    }
  }, [
    loading,
    user,
    isPublic,
    accessReady,
    employeeAccess,
    isAdmin,
    phoneReady,
    mfaReady,
    mfaPassed,
    pathname,
    router,
  ]);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  return <>{children}</>;
}
