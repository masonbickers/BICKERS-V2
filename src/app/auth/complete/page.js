"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import {
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import { sendLoginNotification } from "@/app/utils/loginNotification";

export default function CompleteClerkLoginPage() {
  const router = useRouter();
  const routedRef = useRef(false);
  const { user, userDoc, loading, accessReady, authError } = useAuth() || {};

  useEffect(() => {
    if (routedRef.current || loading || !user || !accessReady) return;
    routedRef.current = true;

    const finishLogin = async () => {
      await sendLoginNotification(user, "clerk").catch(() => {});
      const role = String(userDoc?.role || "").trim().toLowerCase();
      const isAdmin = ["admin", "platformadmin"].includes(role);
      const access = resolveEmployeeAccess(userDoc || {}, { isAdmin });
      const preferred =
        getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
        getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);
      router.replace(selectLandingRoute(access, preferred));
    };

    finishLogin();
  }, [accessReady, loading, router, user, userDoc]);

  if (authError) {
    return <div style={styles.page}>{authError}</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.spinner} />
      <p>Preparing your workspace…</p>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", alignContent: "center", gap: 14, background: "var(--shell-sidebar-bg)", color: "var(--color-surface)", fontFamily: "Arial, sans-serif" },
  spinner: { width: 34, height: 34, border: "3px solid var(--color-text-muted)", borderTopColor: "var(--color-danger)", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
