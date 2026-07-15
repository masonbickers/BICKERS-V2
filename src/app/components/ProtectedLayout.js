"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/authContext";

const PUBLIC_PATHS = ["/login", "/auth/complete"];

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    loading,
    isEnabled,
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
  }, [
    loading,
    user,
    isPublic,
    isEnabled,
    pathname,
    router,
  ]);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  return <>{children}</>;
}
