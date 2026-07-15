"use client";

import layoutStyles from "./HeaderSidebarLayout.styles.module.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { Inter } from "next/font/google";
import { BUILD_INFO } from "@/app/generated/buildInfo";
import { limit, onSnapshot } from "firebase/firestore";
import { db } from "@/app/utils/firebaseClient";
import {
  getRoleDefinition,
  getStoredActiveWorkspace,
  getWorkspaceForPath,
  isAdminPath,
  normalizePlatformRole,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import { hasAuthenticatorMfa, isPhoneVerified } from "@/app/utils/authSecurity";
import {
  clearPagePermissionDenied,
  PAGE_PERMISSION_CLEAR_EVENT,
  PAGE_PERMISSION_DENIED_EVENT,
} from "@/app/utils/pageAccessEvents";
import {
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
} from "@/app/utils/firestoreAccess";
import { useAuth } from "@/app/context/authContext";
import {
  UNSAVED_CHANGES_EVENT,
  bypassUnsavedChangesOnce,
  getUnsavedChangesState,
  shouldBypassUnsavedChanges,
} from "@/app/utils/unsavedChanges";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const APP_VERSION_LABEL = BUILD_INFO.shortCommit
  ? `${BUILD_INFO.version} · ${BUILD_INFO.shortCommit}`
  : BUILD_INFO.version;
const CALENDAR_ACCESS_OPTIONS = { requireCompany: false, signedInWide: true };

const topPillBase = {
  minHeight: 36,
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--legacy-color-f8fbff)",
};

/* -------------------------------------------
   Date helpers (match HR page logic)
------------------------------------------- */
function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [, Y, M, D] = m.map(Number);
  return new Date(Y, M - 1, D, 0, 0, 0, 0);
}

function toSafeDate(v) {
  if (!v) return null;

  // Firestore Timestamp
  if (typeof v?.toDate === "function") return v.toDate();

  // strict YYYY-MM-DD
  if (typeof v === "string") {
    const strict = parseYMD(v);
    if (strict) return strict;
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  }

  // number epoch
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  }

  return null;
}

function holidayYearBucket(h) {
  const s = toSafeDate(h?.startDate);
  const e = toSafeDate(h?.endDate) || s;
  if (!s || !e) return null;
  if (s.getFullYear() !== e.getFullYear()) return null;
  return s.getFullYear();
}

function displayNameFromAccount(user, userDoc = {}) {
  return (
    userDoc?.name ||
    userDoc?.displayName ||
    userDoc?.fullName ||
    user?.displayName ||
    userDoc?.email ||
    user?.email ||
    "User"
  );
}

function initialsFromAccount(user, userDoc = {}) {
  const displayName = displayNameFromAccount(user, userDoc);
  const email = String(userDoc?.email || user?.email || "").trim();
  const source = String(displayName || email || "User").trim();
  const parts = source.includes("@")
    ? [source.split("@")[0]]
    : source.split(/\s+/).filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "U";
}

function accessLabelForAccount(userDoc = {}, isAdmin) {
  const fallbackRole = isAdmin ? "admin" : "user";
  const normalizedRole = normalizePlatformRole(userDoc?.role || fallbackRole);
  const effectiveRole = isAdmin && normalizedRole === "user" ? "admin" : normalizedRole;
  return getRoleDefinition(effectiveRole).label;
}

function resolvePageAccessStatus({
  canSeePlatformAdmin,
  isAdmin,
  pathname,
  user,
  userDoc,
}) {
  const path = pathname || "/";
  const platformAdminPath = path === "/platform-admin" || path.startsWith("/platform-admin/");

  if (!user) {
    return { status: "denied", label: "Denied", detail: "User is not signed in." };
  }

  if (userDoc?.isEnabled === false) {
    return { status: "denied", label: "Denied", detail: "User account is disabled." };
  }

  if (platformAdminPath && !canSeePlatformAdmin) {
    return { status: "denied", label: "Denied", detail: "Platform Admin access is required." };
  }

  if (isAdminPath(path) && !isAdmin) {
    return { status: "denied", label: "Denied", detail: "Admin access is required." };
  }

  return { status: "authorised", label: "Authorised", detail: "This user can access this page." };
}

export default function HeaderSidebarLayout({
  children,
  showBackButton,
  backHref,
  backLabel = "Back",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    userDoc,
    employeeAccess,
    isAdmin,
    isEnabled,
    accessReady,
    logout,
    canUseAdminViewSwitch,
    adminViewMode,
    setAdminViewMode,
    adminViewUserId,
    setAdminViewUser,
  } = useAuth() || {};

  const [showMenu, setShowMenu] = useState(false); // (kept)
  const [activeWorkspace, setActiveWorkspace] = useState("user");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [permissionIssue, setPermissionIssue] = useState(null);
  const [viewAsUsers, setViewAsUsers] = useState([]);
  const [viewAsLoading, setViewAsLoading] = useState(false);

  //  HR notification state
  const [hrNotif, setHrNotif] = useState({ requests: 0, deletes: 0 });

  const unsubHrRef = useRef(null);
  const contentRef = useRef(null);
  const pendingNavigationRef = useRef(null);

  const currentWorkspace = useMemo(() => getWorkspaceForPath(pathname), [pathname]);

  //  single source of truth for whether Admin tab should show
  const canSeeAdmin = !!isAdmin;
  const currentRole = normalizePlatformRole(userDoc?.role);
  const canSeePlatformAdmin = canSeeAdmin && currentRole === "platformAdmin";

  //  HR badge should show for admins only
  const canSeeHrBadge = !!isAdmin;

  useEffect(() => {
    if (!canUseAdminViewSwitch || viewAsUsers.length || viewAsLoading) return;
    let cancelled = false;
    const loadUsers = async () => {
      setViewAsLoading(true);
      try {
        const token = await user?.getIdToken?.();
        if (!token) return;
        const res = await fetch("/api/admin/overview", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not load users.");
        if (cancelled) return;
        const rows = Array.isArray(data.users) ? data.users : [];
        setViewAsUsers(
          rows
            .filter((row) => row?.isEnabled !== false)
            .sort((a, b) =>
              String(a?.name || a?.email || "").localeCompare(String(b?.name || b?.email || ""))
            )
        );
      } catch (error) {
        console.warn("[view-as] user list unavailable:", error);
      } finally {
        if (!cancelled) setViewAsLoading(false);
      }
    };
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [canUseAdminViewSwitch, user, viewAsLoading, viewAsUsers.length]);

  useEffect(() => {
    if (!employeeAccess) return;

    const storedWorkspace =
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);

    setActiveWorkspace(
      storedWorkspace === "service" && employeeAccess.hasServiceAccess
        ? "service"
        : storedWorkspace === "user" && employeeAccess.hasUserAccess
          ? "user"
          : employeeAccess.defaultWorkspace
    );
  }, [employeeAccess]);

  useEffect(() => {
    if (unsubHrRef.current) {
      unsubHrRef.current();
      unsubHrRef.current = null;
    }

    if (!canSeeHrBadge) {
      setHrNotif({ requests: 0, deletes: 0 });
      return undefined;
    }

    const accessState = { user, userDoc, isEnabled, accessReady };
    const gate = resolveDataAccess(accessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "holidays",
        operation: "listen HR badge",
      });
      setHrNotif({ requests: 0, deletes: 0 });
      return undefined;
    }

    const hrRequestQuery = tenantCollectionQuery(db, "holidays", accessState, [limit(100)], CALENDAR_ACCESS_OPTIONS);
    unsubHrRef.current = onSnapshot(hrRequestQuery, (qs) => {
      clearPagePermissionDenied();
      let requested = 0;
      let deleteReq = 0;

        const CURRENT_YEAR = new Date().getFullYear();

        qs.forEach((d) => {
          const h = d.data() || {};
          const st = String(h.status || "").trim().toLowerCase();
          if (!["requested", "delete_requested", "delete-requested"].includes(st)) return;

          //  match HR logic: only count if start/end are valid and same year
          const y = holidayYearBucket(h);
          if (y !== CURRENT_YEAR) return;

          if (st === "requested") requested += 1;
          if (st === "delete_requested" || st === "delete-requested")
            deleteReq += 1;
        });

        setHrNotif({ requests: requested, deletes: deleteReq });
      },
      (error) => {
        handleFirestoreAccessError(error, {
          collectionName: "holidays",
          operation: "listen HR badge",
        });
        setHrNotif({ requests: 0, deletes: 0 });
      }
    );

    return () => {
      if (unsubHrRef.current) {
        unsubHrRef.current();
        unsubHrRef.current = null;
      }
    };
  }, [accessReady, canSeeHrBadge, isEnabled, user, userDoc]);

  useEffect(() => {
    setPermissionIssue(null);

    const samePage = (detail = {}) => {
      const detailPath = String(detail.pathname || "").trim();
      return !detailPath || detailPath === pathname;
    };

    const handlePermissionDenied = (event) => {
      const detail = event?.detail || {};
      if (!samePage(detail)) return;
      setPermissionIssue(detail);
    };

    const handlePermissionClear = (event) => {
      const detail = event?.detail || {};
      if (!samePage(detail)) return;
      setPermissionIssue(null);
    };

    window.addEventListener(PAGE_PERMISSION_DENIED_EVENT, handlePermissionDenied);
    window.addEventListener(PAGE_PERMISSION_CLEAR_EVENT, handlePermissionClear);
    return () => {
      window.removeEventListener(PAGE_PERMISSION_DENIED_EVENT, handlePermissionDenied);
      window.removeEventListener(PAGE_PERMISSION_CLEAR_EVENT, handlePermissionClear);
    };
  }, [pathname]);

  /* -------------------------------------------
     NAV DEFINITIONS
  -------------------------------------------- */
  const featureVisible = (path) => (path === "/settings" ? canSeeAdmin : true);

  const userHeaderLinks = [
    ...(canSeeAdmin ? [{ label: "Admin", path: "/admin" }] : []),
  ];

  const userSidebarGroups = [
    {
      heading: "Operations",
      items: [
        { label: "Home", path: "/screens/homescreen" },
        { label: "Diary", path: "/dashboard" },
        { label: "U-Crane", path: "/u-crane" },
        { label: "Jobs Sheets", path: "/job-home" },
      ],
    },
    {
      heading: "People & Fleet",
      items: [
        { label: "HR / Timesheets", path: "/hr" },
        { label: "Employees", path: "/employee-home" },
        { label: "Vehicles & Equip", path: "/vehicle-home" },
      ],
    },
    {
      heading: "Business",
      items: [
        { label: "H&S", path: "/h-and-s" },
        { label: "Invoicing", path: "/finance-dashboard" },
        { label: "Statistics", path: "/statistics" },
        { label: "Settings", path: "/settings" },
      ],
    },
  ];

  const workspaceNavGroups = userSidebarGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => featureVisible(item.path)),
    }))
    .filter((group) => group.items.length > 0);
  const workspaceNav = workspaceNavGroups.flatMap((group) => group.items);
  const headerLinks = userHeaderLinks.filter((item) => featureVisible(item.path));

  /* -------------------------------------------
     LOGOUT
  -------------------------------------------- */
  const handleLogout = async () => {
    if (typeof logout === "function") await logout();
    router.push("/login");
  };

  useEffect(() => {
    const handleChange = () => {
      if (pendingNavigationRef.current) {
        setPendingNavigation((current) => (current ? { ...current } : current));
      }
    };
    window.addEventListener(UNSAVED_CHANGES_EVENT, handleChange);
    return () => window.removeEventListener(UNSAVED_CHANGES_EVENT, handleChange);
  }, []);

  const runNavigation = async (action) => {
    bypassUnsavedChangesOnce();
    await action();
  };

  const attemptNavigation = (action) => {
    const guard = getUnsavedChangesState();
    if (!guard?.isDirty || shouldBypassUnsavedChanges()) {
      runNavigation(action);
      return;
    }

    pendingNavigationRef.current = action;
    setPendingNavigation({
      message: guard.message || "You have unsaved changes on this page.",
      saveLabel: guard.saveLabel || "Save & Leave",
      canSave: typeof guard.onSave === "function",
    });
  };

  /* -------------------------------------------
     BACK BUTTON
  -------------------------------------------- */
  //  badge total (requested + delete)
  const hrBadgeTotal = useMemo(() => {
    return (hrNotif?.requests || 0) + (hrNotif?.deletes || 0);
  }, [hrNotif]);

  const accountSetup = useMemo(() => {
    const emailReady = user?.emailVerified === true;
    const phoneReady = isPhoneVerified(userDoc || {});
    const mfaReady = hasAuthenticatorMfa(userDoc || {});
    const complete = emailReady && phoneReady && mfaReady;

    return {
      complete,
      label: complete ? "Verified" : "Setup incomplete",
      detail: complete
        ? "Email, phone, and authenticator are active"
        : [emailReady ? null : "Email", phoneReady ? null : "Phone", mfaReady ? null : "Authenticator"]
            .filter(Boolean)
            .join(" / "),
    };
  }, [user?.emailVerified, userDoc]);

  const accountBadge = useMemo(() => {
    return {
      initials: initialsFromAccount(user, userDoc || {}),
      name: displayNameFromAccount(user, userDoc || {}),
      email: String(userDoc?.email || user?.email || "").trim(),
      accessLabel: accessLabelForAccount(userDoc || {}, isAdmin),
    };
  }, [isAdmin, user, userDoc]);

  const pageAccess = useMemo(
    () =>
      resolvePageAccessStatus({
        canSeePlatformAdmin,
        isAdmin,
        pathname,
        user,
        userDoc,
      }),
    [
      canSeePlatformAdmin,
      isAdmin,
      pathname,
      user,
      userDoc,
    ]
  );

  const dataAccess = useMemo(() => {
    if (!permissionIssue) {
      return {
        status: "authorised",
        label: "OK",
        detail: "No Firestore permission failures detected on this page.",
      };
    }

    const target = [permissionIssue.operation, permissionIssue.collectionName]
      .filter(Boolean)
      .join(" ");
    const collectionLabel = permissionIssue.collectionName || "Firestore";

    return {
      status: "denied",
      label: collectionLabel.length > 18 ? "Denied" : `Denied: ${collectionLabel}`,
      detail: target ? `Firestore denied ${target}.` : "Firestore denied data access for this page.",
    };
  }, [permissionIssue]);

  const pageAccessTone = {
    authorised: {
      background: "rgba(107,179,127,0.14)",
      border: "1px solid rgba(107,179,127,0.38)",
      dot: "var(--color-success-accent)",
      text: "var(--legacy-color-d7f6e0)",
      sub: "var(--legacy-color-a8e2b9)",
    },
    denied: {
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.28)",
      dot: "var(--legacy-color-f87171)",
      text: "var(--legacy-color-ffd6d6)",
      sub: "var(--legacy-color-f8b4b4)",
    },
    checking: {
      background: "rgba(251,191,36,0.12)",
      border: "1px solid rgba(251,191,36,0.28)",
      dot: "var(--legacy-color-fbbf24)",
      text: "var(--legacy-color-fdecc8)",
      sub: "var(--legacy-color-f8d98a)",
    },
  }[pageAccess.status];

  const dataAccessTone = {
    authorised: {
      background: "rgba(107,179,127,0.1)",
      border: "1px solid rgba(107,179,127,0.26)",
      dot: "var(--color-success-accent)",
      text: "var(--legacy-color-d7f6e0)",
    },
    denied: {
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.28)",
      dot: "var(--legacy-color-f87171)",
      text: "var(--legacy-color-ffd6d6)",
    },
  }[dataAccess.status];

  const currentNavItem = useMemo(() => {
    return (
      workspaceNav.find(({ path }) =>
        pathname === path ||
        (path === "/screens/homescreen" && pathname === "/home") ||
        (path === "/service/home" && pathname === "/service-home") ||
        (path === "/h-and-s" && (pathname === "/h-and-s" || String(pathname || "").startsWith("/defects")))
      ) || null
    );
  }, [pathname, workspaceNav]);

  const landingRoute = useMemo(() => {
    if (!employeeAccess) return "/dashboard";
    return selectLandingRoute(employeeAccess, activeWorkspace);
  }, [employeeAccess, activeWorkspace]);

  const scrollRestoreKey = useMemo(() => {
    return `layout-scroll:${pathname || "/"}`;
  }, [pathname]);

  const shouldShowBackButton = useMemo(() => {
    if (typeof showBackButton === "boolean") return showBackButton;
    if (!pathname) return false;
    return pathname !== landingRoute;
  }, [showBackButton, pathname, landingRoute]);

  const handleBack = () => {
    if (backHref) {
      attemptNavigation(() => router.push(backHref));
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      attemptNavigation(() => router.back());
      return;
    }

    attemptNavigation(() => router.push(landingRoute));
  };

  const handleStayOnPage = () => {
    pendingNavigationRef.current = null;
    setPendingNavigation(null);
  };

  const handleLeaveWithoutSaving = async () => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setPendingNavigation(null);
    if (action) await runNavigation(action);
  };

  const handleSaveAndLeave = async () => {
    const guard = getUnsavedChangesState();
    const action = pendingNavigationRef.current;
    if (!action) {
      setPendingNavigation(null);
      return;
    }

    if (typeof guard?.onSave === "function") {
      const result = await guard.onSave();
      if (result === false) return;
    }

    pendingNavigationRef.current = null;
    setPendingNavigation(null);
    await runNavigation(action);
  };

  useEffect(() => {
    if (!employeeAccess) return;
    if (currentWorkspace === "service" && employeeAccess.hasServiceAccess) {
      setActiveWorkspace("service");
      return;
    }
    if (currentWorkspace === "user" && employeeAccess.hasUserAccess) {
      setActiveWorkspace("user");
    }
  }, [currentWorkspace, employeeAccess]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const restore = () => {
      try {
        const saved = Number(sessionStorage.getItem(scrollRestoreKey) || 0);
        if (Number.isFinite(saved) && saved > 0) {
          el.scrollTop = saved;
        } else {
          el.scrollTop = 0;
        }
      } catch {
        el.scrollTop = 0;
      }
    };

    const raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, [scrollRestoreKey]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const save = () => {
      try {
        sessionStorage.setItem(scrollRestoreKey, String(el.scrollTop || 0));
      } catch {
        // ignore sessionStorage errors
      }
    };

    el.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      el.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [scrollRestoreKey]);

  return (
    <div
      className={inter.variable}
      style={{
        display: "flex",
        height: "100dvh",
        minHeight: "100dvh",
        overflow: "hidden",
        fontFamily: "var(--font-inter)",
        background: "var(--shell-gradient)",
      }}
    >
      {/* ----------------- Sidebar ----------------- */}
      <aside
        style={{
          width: isCollapsed ? "60px" : "220px",
          flexShrink: 0,
          boxSizing: "border-box",
          background: "var(--shell-sidebar-bg)",
          color: "var(--shell-text)",
          padding: isCollapsed ? "18px 10px" : "22px 16px",
          display: "flex",
          flexDirection: "column",
          borderRight: "none",
          boxShadow: "16px 0 36px rgba(2,6,23,0.18)",
          position: "relative",
          transition: "width 0.3s ease",
        }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--shell-muted)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 700,
            marginBottom: "18px",
            borderRadius: 10,
            width: isCollapsed ? 40 : 36,
            height: 36,
            alignSelf: isCollapsed ? "center" : "flex-start",
          }}
        >
          {isCollapsed ? ">" : "<"}
        </button>

        {!isCollapsed ? (
          <div
            className={layoutStyles.extracted1}
          >
            <img
              src="/bickers-action-logo.png"
              alt="Logo"
              className={layoutStyles.extracted2}
            />
            <div className={layoutStyles.extracted3}>
              Booking System
            </div>
            <div className={layoutStyles.extracted4}>
              Operations platform
            </div>
          </div>
        ) : (
          <div
            className={layoutStyles.extracted5}
          >
            BA
          </div>
        )}

        <nav className={layoutStyles.extracted6}>
          {workspaceNavGroups.map((group) => (
            <div key={group.heading}>
              {!isCollapsed && (
                <div
                  className={layoutStyles.extracted7}
                >
                  {group.heading}
                </div>
              )}

              <div className={layoutStyles.extracted8}>
                {group.items.map(({ label, path }) => {
                  const active =
                    pathname === path ||
                    (path === "/screens/homescreen" && pathname === "/home") ||
                    (path === "/service/home" && pathname === "/service-home") ||
                    (path === "/h-and-s" && (pathname === "/h-and-s" || String(pathname || "").startsWith("/defects")));

                  const isHrItem = path === "/hr";
                  const showHrBadge = isHrItem && canSeeHrBadge && hrBadgeTotal > 0;
                  return (
                    <button
                      key={label}
                      onClick={() => attemptNavigation(() => router.push(path))}
                      style={{
                        background: active ? "var(--shell-active-bg)" : "transparent",
                        border: active
                          ? `1px solid ${"var(--shell-active-border)"}`
                          : "1px solid transparent",
                        color: active ? "var(--shell-text)" : "var(--shell-muted)",
                        fontSize: "14px",
                        textAlign: isCollapsed ? "center" : "left",
                        padding: isCollapsed ? "10px 8px" : "11px 14px",
                        cursor: "pointer",
                        position: "relative",
                        borderRadius: 12,
                        fontWeight: active ? 700 : 600,
                        boxShadow: active ? `inset 3px 0 0 ${"var(--color-success-accent)"}` : "none",
                        transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
                      }}
                      title={
                        showHrBadge
                          ? `${label}: ${hrNotif.requests} holiday request(s), ${hrNotif.deletes} delete request(s)`
                          : label
                      }
                    >
                      {!isCollapsed ? (
                        <span
                          className={layoutStyles.extracted9}
                        >
                          <span>{label}</span>
                          {showHrBadge && (
                            <span
                              className={layoutStyles.extracted10}
                            >
                              {hrBadgeTotal}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span
                          className={layoutStyles.extracted11}
                        >
                          {label.slice(0, 2).toUpperCase()}
                        </span>
                      )}

                      {isCollapsed && showHrBadge && (
                        <span
                          className={layoutStyles.extracted12}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={layoutStyles.extracted13}>
          <button
            onClick={() => attemptNavigation(handleLogout)}
            className={layoutStyles.extracted14}
          >
            {isCollapsed ? "LO" : "Logout"}
          </button>
        </div>
      </aside>

      {/* ----------------- Main ----------------- */}
      <div
        className={layoutStyles.extracted15}
      >
        {/* Header */}
        <header
          className={layoutStyles.extracted16}
        >
          <div className={layoutStyles.extracted17}>
            {shouldShowBackButton && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  border: `1px solid ${"var(--shell-border)"}`,
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--legacy-color-f8fbff)",
                  fontSize: 13,
                  fontWeight: 800,
                  padding: "8px 12px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                aria-label={backLabel}
                title={backLabel}
              >
                <span aria-hidden="true">&larr;</span>
                <span>{backLabel}</span>
              </button>
            )}
            <div className={layoutStyles.extracted18}>
              <div
                className={layoutStyles.extracted19}
              >
                User workspace
              </div>
              <div
                className={layoutStyles.extracted20}
              >
                {currentNavItem?.label || "Bickers Booking System"}
              </div>
            </div>
          </div>

          <nav
            className={layoutStyles.extracted21}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                ...topPillBase,
                padding: "6px 12px",
                background: accountSetup.complete
                  ? "rgba(107,179,127,0.14)"
                  : "rgba(248,113,113,0.12)",
                border: accountSetup.complete
                  ? "1px solid rgba(107,179,127,0.38)"
                  : "1px solid rgba(248,113,113,0.28)",
                color: accountSetup.complete ? "var(--legacy-color-d7f6e0)" : "var(--legacy-color-ffd6d6)",
              }}
              title={accountSetup.complete ? accountSetup.detail : `Missing: ${accountSetup.detail}`}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: accountSetup.complete ? "var(--color-success-accent)" : "var(--legacy-color-f87171)",
                  boxShadow: accountSetup.complete
                    ? "0 0 0 4px rgba(107,179,127,0.14)"
                    : "0 0 0 4px rgba(248,113,113,0.12)",
                }}
              />
              <div className={layoutStyles.extracted22}>
                <span className={layoutStyles.extracted23}>
                  {accountSetup.label}
                </span>
                {!accountSetup.complete && (
                  <span className={layoutStyles.extracted24}>
                    Missing: {accountSetup.detail}
                  </span>
                )}
              </div>
            </div>

            <div
              className={layoutStyles.extracted25}
              title={[accountBadge.name, accountBadge.email, accountBadge.accessLabel]
                .filter(Boolean)
                .join(" - ")}
              aria-label={`Signed in as ${accountBadge.name}, ${accountBadge.accessLabel}`}
            >
              <span
                className={layoutStyles.extracted26}
              >
                {accountBadge.initials}
              </span>
              <span className={layoutStyles.extracted27}>
                <span
                  className={layoutStyles.extracted28}
                >
                  {accountBadge.accessLabel}
                </span>
                <span
                  className={layoutStyles.extracted29}
                >
                  {accountBadge.name}
                </span>
              </span>
            </div>

            {canUseAdminViewSwitch && (
              <button
                type="button"
                onClick={() => setAdminViewMode?.(adminViewMode === "user" ? "admin" : "user")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  ...topPillBase,
                  padding: "5px 8px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: adminViewMode === "user" ? "rgba(59,130,246,0.18)" : "rgba(107,179,127,0.14)",
                }}
                title="Switch between your real admin view and a normal user view."
                aria-label={`Testing view: ${adminViewMode === "user" ? "User" : "Admin"}`}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    color: adminViewMode === "user" ? "var(--legacy-color-bfdbfe)" : "var(--legacy-color-d7f6e0)",
                    minWidth: 34,
                    textAlign: "center",
                  }}
                >
                  User
                </span>
                <span
                  className={layoutStyles.extracted30}
                >
                  <span
                    style={{
                      display: "block",
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: "var(--legacy-color-f8fbff)",
                      transform: adminViewMode === "user" ? "translateX(0)" : "translateX(18px)",
                      transition: "transform 0.18s ease",
                    }}
                  />
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 900,
                    color: adminViewMode === "admin" ? "var(--legacy-color-d7f6e0)" : "var(--legacy-color-a8b3c2)",
                    minWidth: 38,
                    textAlign: "center",
                  }}
                >
                  Admin
                </span>
              </button>
            )}

            {canUseAdminViewSwitch && (
              <select
                value={adminViewUserId || ""}
                onChange={(event) => {
                  const selectedId = event.target.value;
                  if (!selectedId) {
                    setAdminViewUser?.(null);
                    return;
                  }
                  const selected = viewAsUsers.find(
                    (row) => String(row?.uid || row?.id || "") === selectedId
                  );
                  if (selected) setAdminViewUser?.(selected);
                }}
                className={layoutStyles.extracted31}
                title="View the app as another enabled user."
              >
                <option value="" className={layoutStyles.extracted32}>
                  {viewAsLoading ? "Loading users..." : "View as current user"}
                </option>
                {viewAsUsers.map((row) => {
                  const id = String(row?.uid || row?.id || "");
                  const label = row?.name || row?.email || id;
                  const suffix = row?.email && row?.name ? ` - ${row.email}` : "";
                  return (
                    <option key={id} value={id} className={layoutStyles.extracted33}>
                      {label}
                      {suffix}
                    </option>
                  );
                })}
              </select>
            )}

            {headerLinks.map(({ label, path, icon }) => (
              <Link
                key={label}
                href={path}
                onClick={(event) => {
                  event.preventDefault();
                  attemptNavigation(() => router.push(path));
                }}
                style={{
                  ...topPillBase,
                  color: pathname === path ? "var(--legacy-color-d7f6e0)" : "var(--legacy-color-d0dae6)",
                  background: pathname === path ? "rgba(107,179,127,0.14)" : topPillBase.background,
                  border: pathname === path
                    ? "1px solid rgba(107,179,127,0.38)"
                    : topPillBase.border,
                  fontSize: 11,
                  textDecoration: "none",
                  fontWeight: 900,
                  padding: "6px 12px",
                  gap: 7,
                }}
              >
                {icon ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border:
                        pathname === path
                          ? `1px solid ${"var(--color-success-accent)"}`
                          : "1px solid rgba(168,179,194,0.34)",
                      background:
                        pathname === path
                          ? "rgba(107,179,127,0.16)"
                          : "rgba(255,255,255,0.04)",
                      fontSize: 10.5,
                      fontWeight: 900,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {icon}
                  </span>
                ) : null}
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Content */}
        <div
          className={`app-shell-content ${layoutStyles.extracted43}`}
          ref={contentRef}

        >
          {children}
        </div>

        {pendingNavigation ? (
          <div
            className={layoutStyles.extracted34}
          >
            <div
              className={layoutStyles.extracted35}
            >
              <div className={layoutStyles.extracted36}>
                Unsaved changes
              </div>
              <div className={layoutStyles.extracted37}>
                {pendingNavigation.message}
              </div>
              <div className={layoutStyles.extracted38}>
                <button
                  type="button"
                  onClick={handleStayOnPage}
                  className={layoutStyles.extracted39}
                >
                  Stay on page
                </button>
                <button
                  type="button"
                  onClick={handleLeaveWithoutSaving}
                  className={layoutStyles.extracted40}
                >
                  Leave without saving
                </button>
                {pendingNavigation.canSave ? (
                  <button
                    type="button"
                    onClick={handleSaveAndLeave}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${"var(--color-brand)"}`,
                      background: "var(--color-brand)",
                      color: "var(--legacy-color-fff)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {pendingNavigation.saveLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <footer
          style={{
            background: "var(--legacy-color-000000)",
            minHeight: "26px",
            fontSize: "10px",
            color: "var(--legacy-color-d0dae6)",
            borderTop: `1px solid ${"var(--shell-border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            padding: "0 18px",
          }}
        >
          <span>Copyright {new Date().getFullYear()} Bickers Booking System v{APP_VERSION_LABEL}</span>
          <div
            className={layoutStyles.extracted41}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: pageAccessTone.border,
                background: pageAccessTone.background,
                color: pageAccessTone.text,
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1,
              }}
              title={pageAccess.detail}
              aria-label={`Page access ${pageAccess.label}: ${pageAccess.detail}`}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: pageAccessTone.dot,
                  flexShrink: 0,
                }}
              />
              Page: {pageAccess.label}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: dataAccessTone.border,
                background: dataAccessTone.background,
                color: dataAccessTone.text,
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1,
              }}
              title={dataAccess.detail}
              aria-label={`Data access ${dataAccess.label}: ${dataAccess.detail}`}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: dataAccessTone.dot,
                  flexShrink: 0,
                }}
              />
              Data: {dataAccess.label}
            </span>
            {canSeePlatformAdmin ? (
              <button
                type="button"
                onClick={() => attemptNavigation(() => router.push("/platform-admin"))}
                className={layoutStyles.extracted42}
                title="Open Platform Admin"
              >
                Platform
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
