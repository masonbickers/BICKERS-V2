"use client";

import layoutStyles from "./ProtectedLayout.styles.module.css";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import {
  isAdminPath,
  isModuleEnabledForPath,
  isPathAllowedForAccess,
  normalizePlatformRole,
  selectLandingRoute,
} from "@/app/utils/accessControl";

const PUBLIC_PATHS = ["/", "/login"];

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    loading,
    isEnabled,
    accessReady,
    employeeAccess,
    featureFlags,
    userDoc,
    logout,
  } = useAuth() || {};

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || String(pathname || "").startsWith(`${path}/`)
  );
  const role = normalizePlatformRole(userDoc?.role);
  const pathAllowed =
    Boolean(employeeAccess) &&
    isPathAllowedForAccess(pathname, employeeAccess) &&
    isModuleEnabledForPath(pathname, featureFlags) &&
    (!isAdminPath(pathname) || ["admin", "platformAdmin"].includes(role)) &&
    (!String(pathname || "").startsWith("/platform-admin") || role === "platformAdmin");

  useEffect(() => {
    if (loading || (user && !accessReady)) return;

    if (!user) {
      if (!isPublic) router.push("/login");
      return;
    }

    if (isPublic) return;

    if (isEnabled === false) {
      logout?.();
      return;
    }
    if (!pathAllowed) {
      const landing = selectLandingRoute(employeeAccess);
      if (pathname !== landing) router.replace(`${landing}?access=denied`);
    }
  }, [
    loading,
    user,
    isPublic,
    isEnabled,
    accessReady,
    employeeAccess,
    pathAllowed,
    logout,
    pathname,
    router,
  ]);

  if (loading || (!isPublic && (!user || !accessReady))) {
    return <div className={layoutStyles.extracted1}>Loading...</div>;
  }

  if (!isPublic && (isEnabled === false || !pathAllowed)) {
    return <div className={layoutStyles.extracted1}>Checking access...</div>;
  }

  return <>{children}</>;
}
