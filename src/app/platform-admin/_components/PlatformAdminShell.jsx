"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import shellStyles from "./PlatformAdminShell.module.css";
import {
  Activity,
  Building2,
  Brush,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flag,
  Home,
  KeyRound,
  Link2,
  ListChecks,
  LockKeyhole,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { auth } from "../../../../firebaseConfig";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { useDeploymentConfig } from "@/app/config/deploymentConfig";

const SIDEBAR_PREFERENCE_KEY = "bickers-sidebar:v1";

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
  const deployment = useDeploymentConfig();
  const appearance = useAppearance();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) || "null");
      setIsCollapsed(saved?.collapsed === true);
    } catch {
      // Device storage is optional; keep the platform navigation expanded.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) || "null");
      window.localStorage.setItem(
        SIDEBAR_PREFERENCE_KEY,
        JSON.stringify({ ...(saved && typeof saved === "object" ? saved : {}), collapsed: isCollapsed })
      );
    } catch {
      // Keep the in-memory preference when device storage is unavailable.
    }
  }, [isCollapsed]);

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
      <main className={shellStyles.loadingPage}>
        <Image
          src={deployment.companyLogoUrl}
          alt={`${deployment.displayName} logo`}
          width={160}
          height={80}
          className={shellStyles.loadingLogo}
          unoptimized
        />
        <strong>Checking platform access...</strong>
      </main>
    );
  }

  const accountName = String(me?.displayName || me?.email?.split("@")[0] || "Platform Admin").trim();
  const initials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PA";
  const emailVerified = me?.emailVerified === true;

  return (
    <main className={shellStyles.shellRoot}>
      <aside
        className={shellStyles.sidebar}
        data-collapsed={isCollapsed}
        style={{ "--sidebar-width": isCollapsed ? "var(--shell-sidebar-collapsed-width)" : "clamp(248px, var(--shell-sidebar-width), 300px)" }}
      >
        <div className={shellStyles.sidebarBrandRow}>
          <div className={shellStyles.sidebarBrand}>
            <Image
              src={deployment.companyLogoUrl}
              alt={`${deployment.displayName} logo`}
              width={180}
              height={68}
              className={shellStyles.sidebarLogo}
              unoptimized
            />
            {!isCollapsed ? (
              <span className={shellStyles.sidebarBrandCopy}>
                <strong>{deployment.shortName || deployment.displayName} System</strong>
                <small>Operations platform</small>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            className={shellStyles.sidebarCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        {!isCollapsed ? (
          <div className={shellStyles.sidebarControls}>
            <div className={shellStyles.workspaceControl}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Platform workspace</span>
            </div>
          </div>
        ) : null}

        <div className={shellStyles.sidebarScroll}>
          <nav className={shellStyles.sidebarNav} aria-label="Platform administration">
            {!isCollapsed ? <div className={shellStyles.sidebarGroupLabel}>Platform</div> : null}
            <div className={shellStyles.sidebarItems}>
              {navItems.map(([href, label, Icon]) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`${shellStyles.navButton} ${active ? shellStyles.navButtonActive : ""} ${isCollapsed ? shellStyles.navButtonCollapsed : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={label}
                  >
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                    {!isCollapsed ? <span>{label}</span> : null}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        <div className={shellStyles.sidebarFooter}>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className={shellStyles.sidebarAccount}
            title={`${accountName} · Platform Admin`}
          >
            <span className={shellStyles.sidebarAvatar}>{initials}</span>
            {!isCollapsed ? (
              <span className={shellStyles.sidebarAccountCopy}>
                <strong>{accountName}</strong>
                <small>Platform Admin</small>
              </span>
            ) : null}
          </button>
        </div>
      </aside>

      <section className={shellStyles.mainColumn}>
        <header className={shellStyles.topbar}>
          <div className={shellStyles.topbarTitleGroup}>
            <button type="button" onClick={() => router.push("/dashboard")} className={shellStyles.backButton}>
              <span aria-hidden="true">&larr;</span>
              <span>Back</span>
            </button>
            <div className={shellStyles.topbarTitleCopy}>
              <div>Platform workspace</div>
              <strong>{title}</strong>
            </div>
          </div>

          <nav className={shellStyles.topbarActions} aria-label="Platform account controls">
            <span
              className={shellStyles.statusPill}
              data-complete={emailVerified}
              title={emailVerified ? "Email is verified" : "Email verification is required"}
            >
              <span className={shellStyles.statusDot} data-complete={emailVerified} />
              {emailVerified ? "Verified" : "Setup incomplete"}
            </span>
            <span className={shellStyles.accountPill} title={me?.email || accountName}>
              <span className={shellStyles.accountAvatar}>{initials}</span>
              <span className={shellStyles.accountCopy}>
                <strong>Platform Admin</strong>
                <small>{accountName}</small>
              </span>
            </span>
            <Link href="/dashboard" className={shellStyles.topLink}>Bickers</Link>
            {onRefresh ? (
              <button type="button" onClick={onRefresh} disabled={loading} className={shellStyles.topLink}>
                <RefreshCw size={15} />
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            ) : null}
            <div className={shellStyles.themeSelector} role="group" aria-label="Colour mode">
              {[
                ["dark", "Dark", Moon],
                ["normal", "Normal", Monitor],
                ["light", "Light", Sun],
              ].map(([value, label, Icon]) => (
                <button
                  type="button"
                  key={value}
                  className={shellStyles.themeModeButton}
                  data-selected={appearance.resolvedMode === value}
                  onClick={() => appearance.setModePreference(value)}
                  title={`Use ${label.toLowerCase()} mode`}
                  aria-pressed={appearance.resolvedMode === value}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </nav>
        </header>

        <div className={shellStyles.contentGutter}>
          <div className={shellStyles.pageHeading}>
            <div className={shellStyles.pageKicker}>Platform Admin</div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {children}
        </div>

        <footer className={shellStyles.footer}>
          Copyright {new Date().getFullYear()} {deployment.siteTitle || deployment.displayName}
        </footer>
      </section>
    </main>
  );
}
