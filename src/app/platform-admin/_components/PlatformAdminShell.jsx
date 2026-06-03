"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Activity,
  Building2,
  Brush,
  ClipboardList,
  Flag,
  Home,
  KeyRound,
  Link2,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { auth } from "../../../../firebaseConfig";

const navItems = [
  ["/platform-admin", "Dashboard", Home],
  ["/platform-admin/companies", "Companies", Building2],
  ["/platform-admin/branding", "Branding", Brush],
  ["/platform-admin/users", "All Users", Users],
  ["/platform-admin/employee-linking", "Employee Linking", Link2],
  ["/platform-admin/security", "Security Centre", ShieldCheck],
  ["/platform-admin/mfa", "MFA", LockKeyhole],
  ["/platform-admin/roles", "Roles", KeyRound],
  ["/platform-admin/audit-logs", "Audit Logs", ListChecks],
  ["/platform-admin/login-security", "Login Logs", Activity],
  ["/platform-admin/cleanup", "Cleanup", ClipboardList],
  ["/platform-admin/feature-control", "Feature Control", Flag],
  ["/platform-admin/settings", "Global Settings", Settings],
];

export default function PlatformAdminShell({ children, title, subtitle, onRefresh, loading }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const refreshPlatformAccess = async (user) => {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/security/bootstrap-access", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not verify platform access.");
      return data?.access || {};
    };

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const access = await refreshPlatformAccess(user);
        const role = String(access.role || "").trim().toLowerCase();
        if (role !== "platformadmin" || access.isEnabled === false) {
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.error("[platform-admin] access check failed:", error);
        router.push("/dashboard");
        return;
      }
      if (cancelled) return;
      setMe(user);
      setChecking(false);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [router]);

  if (checking) {
    return (
      <main style={styles.loadingPage}>
        <Image src="/bas-software-logo.png" alt="BAS Software" width={92} height={92} />
        <strong>Checking platform access...</strong>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <Image src="/bas-software-logo.png" alt="BAS Software" width={48} height={48} />
          <div>
            <div style={styles.kicker}>BAS Software</div>
            <div style={styles.brandTitle}>Platform Admin</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {navItems.map(([href, label, Icon]) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{ ...styles.navItem, ...(active ? styles.navActive : null) }}>
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section style={styles.content}>
        <header style={styles.topbar}>
          <div>
            <div style={styles.kicker}>Signed in as {me?.email}</div>
            <h1 style={styles.title}>{title}</h1>
            {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <div style={styles.actions}>
            <span style={styles.badge}><Sparkles size={14} /> Platform Admin</span>
            <button type="button" onClick={() => router.push("/dashboard")} style={styles.button}>
              Back to Bickers
            </button>
            {onRefresh ? (
              <button type="button" onClick={onRefresh} disabled={loading} style={styles.primaryButton}>
                <RefreshCw size={15} />
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            ) : null}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr)",
    background: "#f3f6f9",
    color: "#0f172a",
    fontFamily: "Arial, sans-serif",
  },
  loadingPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    gap: 12,
    background: "#f3f6f9",
    color: "#0f172a",
    fontFamily: "Arial, sans-serif",
  },
  sidebar: {
    minHeight: "100vh",
    padding: 16,
    background: "#0f172a",
    color: "#fff",
    position: "sticky",
    top: 0,
  },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  kicker: { fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" },
  brandTitle: { fontSize: 18, fontWeight: 900 },
  nav: { display: "grid", gap: 6 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "10px 11px",
    borderRadius: 8,
    color: "#cbd5e1",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 800,
  },
  navActive: { background: "#1e293b", color: "#fff" },
  content: { minWidth: 0, padding: 22 },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
  },
  title: { margin: "4px 0", fontSize: 28, letterSpacing: 0 },
  subtitle: { margin: 0, color: "#475569", fontWeight: 700 },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    border: "1px solid #bae6fd",
    borderRadius: 8,
    color: "#0369a1",
    background: "#f0f9ff",
    fontWeight: 900,
    fontSize: 13,
  },
  button: {
    height: 36,
    padding: "0 11px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  },
  primaryButton: {
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "0 11px",
    border: "1px solid #b91c1c",
    borderRadius: 8,
    background: "#ef4444",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
};
