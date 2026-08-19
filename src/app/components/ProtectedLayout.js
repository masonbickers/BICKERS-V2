"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import BrandedLoader from "./BrandedLoader";
import HeaderSidebarLayout from "./HeaderSidebarLayout";
import UserActivityTracker from "./UserActivityTracker";
import {
  isAdminPath,
  isFinanceHandoffPath,
  isModuleEnabledForPath,
  isPathAllowedForAccess,
  isPersonalSettingsPath,
  normalizePlatformRole,
  selectLandingRoute,
} from "@/app/utils/accessControl";

const PUBLIC_PATHS = ["/", "/login"];

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
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
  const isEmbeddedQuoteView = String(pathname || "").startsWith("/quote-view/");
  const isPlatformAdminWorkspace = String(pathname || "").startsWith("/platform-admin");
  const role = normalizePlatformRole(userDoc?.role);
  const moduleEnabled = isModuleEnabledForPath(pathname, featureFlags);
  const financeHandoffPath = isFinanceHandoffPath(pathname);
  const personalSettingsPath = isPersonalSettingsPath(pathname);
  const pathAllowed =
    Boolean(employeeAccess) &&
    isPathAllowedForAccess(pathname, employeeAccess) &&
    (personalSettingsPath || financeHandoffPath || ["admin", "platformAdmin"].includes(role) || moduleEnabled) &&
    (!isAdminPath(pathname) || ["admin", "platformAdmin"].includes(role)) &&
    (!String(pathname || "").startsWith("/platform-admin") || role === "platformAdmin");

  useEffect(() => {
    if (!clerkLoaded || loading || (isSignedIn && (!user || !accessReady))) return;

    if (!isSignedIn || !user) {
      if (!isPublic) router.replace("/login");
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
    clerkLoaded,
    isSignedIn,
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

  if (!clerkLoaded || loading || (!isPublic && (!isSignedIn || !user || !accessReady))) {
    return (
      <BrandedLoader
        label={pathname === "/auth/complete" ? "Preparing your workspace…" : "Loading…"}
      />
    );
  }

  if (!isPublic && (isEnabled === false || !pathAllowed)) {
    return <BrandedLoader label="Checking access…" />;
  }

  if (isPublic || isEmbeddedQuoteView) {
    return <>{children}</>;
  }

  return (
    <>
      <UserActivityTracker />
      {isPlatformAdminWorkspace ? children : <HeaderSidebarLayout>{children}</HeaderSidebarLayout>}
    </>
  );
}
