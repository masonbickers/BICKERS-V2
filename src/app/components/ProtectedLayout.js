"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import { isAdminPath } from "@/app/utils/accessControl";

const PUBLIC_PATHS = ["/login", "/auth/complete", "/credential-reset-required"];

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    loading,
    isEnabled,
    userDoc,
    isAdmin,
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

    if (isEnabled === false) {
      router.replace("/login?disabled=1");
      return;
    }
    if (userDoc?.credentialResetRequired === true) {
      router.replace("/login?reset=required");
      return;
    }
    if (isAdminPath(pathname) && !isAdmin) {
      router.replace("/screens/homescreen?access=denied");
    }
  }, [
    loading,
    user,
    isPublic,
    isEnabled,
    userDoc?.credentialResetRequired,
    isAdmin,
    pathname,
    router,
  ]);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  return <>{children}</>;
}
