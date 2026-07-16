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
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { useContentLabels } from "@/app/components/ContentLabelsProvider";
import { Button, Modal, Select } from "@/app/components/ui";
import { Moon, Sun } from "lucide-react";
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
  const appearance = useAppearance();
  const { label: contentLabel } = useContentLabels();
  const {
    user,
    realUser,
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
  const [viewAsError, setViewAsError] = useState("");
  const [viewAsReloadKey, setViewAsReloadKey] = useState(0);

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
    if (!canUseAdminViewSwitch) {
      setViewAsUsers([]);
      setViewAsError("");
      setViewAsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadUsers = async () => {
      setViewAsLoading(true);
      setViewAsError("");
      try {
        const token = await realUser?.getIdToken?.();
        if (!token) throw new Error("Your admin session is not ready.");
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
        if (!cancelled) {
          setViewAsUsers([]);
          setViewAsError(error?.message || "Could not load users.");
        }
      } finally {
        if (!cancelled) setViewAsLoading(false);
      }
    };
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [canUseAdminViewSwitch, realUser, viewAsReloadKey]);

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
    ...(canSeeAdmin ? [{ label: contentLabel("navigation.admin"), path: "/admin" }] : []),
  ];

  const userSidebarGroups = [
    {
      heading: "Operations",
      items: [
        { label: contentLabel("navigation.home"), path: "/screens/homescreen" },
        { label: "Diary", path: "/dashboard" },
        { label: "U-Crane", path: "/u-crane" },
        { label: "Jobs Sheets", path: "/job-home" },
      ],
    },
    {
      heading: "People & Fleet",
      items: [
        { label: "HR / Timesheets", path: "/hr" },
        { label: contentLabel("navigation.employees"), path: "/employee-home" },
        { label: `${contentLabel("navigation.vehicles")} & ${contentLabel("navigation.equipment")}`, path: "/vehicle-home" },
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
      text: "var(--color-border)",
      sub: "var(--color-success-border)",
    },
    denied: {
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.28)",
      dot: "var(--color-warning-border)",
      text: "var(--color-danger-border)",
      sub: "var(--color-danger-border)",
    },
    checking: {
      background: "rgba(251,191,36,0.12)",
      border: "1px solid rgba(251,191,36,0.28)",
      dot: "var(--color-warning-border)",
      text: "var(--color-accent-soft)",
      sub: "var(--color-warning-border)",
    },
  }[pageAccess.status];

  const dataAccessTone = {
    authorised: {
      background: "rgba(107,179,127,0.1)",
      border: "1px solid rgba(107,179,127,0.26)",
      dot: "var(--color-success-accent)",
      text: "var(--color-border)",
    },
    denied: {
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.28)",
      dot: "var(--color-warning-border)",
      text: "var(--color-danger-border)",
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
    <div className={`${inter.variable} ${layoutStyles.shellRoot}`}>
      {/* ----------------- Sidebar ----------------- */}
      {/* style-audit-allow runtime: responsive sidebar geometry */}
      <aside className={layoutStyles.sidebar} style={{ "--sidebar-width": isCollapsed ? "var(--shell-sidebar-collapsed-width)" : "var(--shell-sidebar-width)", "--sidebar-padding": isCollapsed ? "18px 10px" : "22px 16px" }}>
        <Button bare
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`${layoutStyles.collapseButton} ${isCollapsed ? layoutStyles.collapseButtonCollapsed : ""}`}
        >
          {isCollapsed ? ">" : "<"}
        </Button>

        {!isCollapsed ? (
          <div
            className={layoutStyles.extracted1}
          >
            <img
              src={appearance.theme.companyLogo || "/bickers-action-logo.png"}
              alt={`${appearance.theme.appName} logo`}
              className={layoutStyles.extracted2}
            />
            <div className={layoutStyles.extracted3}>
              {appearance.theme.appName}
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
                    <Button bare
                      key={label}
                      onClick={() => attemptNavigation(() => router.push(path))}
                      className={`${layoutStyles.navButton} ${active ? layoutStyles.navButtonActive : ""} ${isCollapsed ? layoutStyles.navButtonCollapsed : ""}`}
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
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={layoutStyles.extracted13}>
          <Button bare
            onClick={() => attemptNavigation(handleLogout)}
            className={layoutStyles.extracted14}
          >
            {isCollapsed ? "LO" : "Logout"}
          </Button>
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
              <Button bare
                type="button"
                onClick={handleBack}
                className={layoutStyles.backButton}
                aria-label={backLabel}
                title={backLabel}
              >
                <span aria-hidden="true">&larr;</span>
                <span>{backLabel}</span>
              </Button>
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
                {currentNavItem?.label || appearance.theme.appName}
              </div>
            </div>
          </div>

          <nav
            className={layoutStyles.extracted21}
          >
            <div className={layoutStyles.statusPill} data-complete={accountSetup.complete}
              title={accountSetup.complete ? accountSetup.detail : `Missing: ${accountSetup.detail}`}
            >
              <span className={layoutStyles.statusDot} data-complete={accountSetup.complete} />
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
              <Button bare
                type="button"
                onClick={() => setAdminViewMode?.(adminViewMode === "user" ? "admin" : "user")}
                className={layoutStyles.viewSwitch}
                data-mode={adminViewMode}
                title={adminViewMode === "user" ? "Return to your admin view." : "Test the app with normal user permissions."}
                aria-label={`Testing view: ${adminViewMode === "user" ? "User" : "Admin"}`}
                aria-pressed={adminViewMode === "user"}
              >
                <span className={`${layoutStyles.viewLabel} ${adminViewMode === "user" ? layoutStyles.viewLabelActive : ""}`}>
                  User
                </span>
                <span
                  className={layoutStyles.extracted30}
                >
                  <span className={layoutStyles.switchKnob} data-mode={adminViewMode} />
                </span>
                <span className={`${layoutStyles.viewLabel} ${adminViewMode === "admin" ? layoutStyles.viewLabelActive : ""}`}>
                  Admin
                </span>
              </Button>
            )}

            {canUseAdminViewSwitch && (
              <Select bare
                value={adminViewUserId || ""}
                disabled={viewAsLoading}
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
                onClick={() => {
                  if (viewAsError) setViewAsReloadKey((key) => key + 1);
                }}
                className={layoutStyles.extracted31}
                title={viewAsError ? `${viewAsError} Click to retry.` : "View the app as another enabled user."}
                aria-label="User account to test as"
              >
                <option value="" className={layoutStyles.extracted32}>
                  {viewAsLoading
                    ? "Loading users..."
                    : viewAsError
                      ? "Could not load users - retry"
                      : "View as current user"}
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
              </Select>
            )}

            {headerLinks.map(({ label, path, icon }) => (
              <Link
                key={label}
                href={path}
                onClick={(event) => {
                  event.preventDefault();
                  attemptNavigation(() => router.push(path));
                }}
                className={`${layoutStyles.topLink} ${pathname === path ? layoutStyles.topLinkActive : ""}`}
              >
                {icon ? (
                  <span className={`${layoutStyles.topLinkIcon} ${pathname === path ? layoutStyles.topLinkIconActive : ""}`}>
                    {icon}
                  </span>
                ) : null}
                {label}
              </Link>
            ))}

            <Button bare
              type="button"
              className={layoutStyles.themeToggle}
              data-mode={appearance.resolvedMode}
              onClick={() => appearance.setModePreference(appearance.resolvedMode === "dark" ? "light" : "dark")}
              title={`Switch to ${appearance.resolvedMode === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${appearance.resolvedMode === "dark" ? "light" : "dark"} mode`}
              aria-pressed={appearance.resolvedMode === "dark"}
            >
              {appearance.resolvedMode === "dark" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
              <span>{appearance.resolvedMode === "dark" ? "Dark" : "Light"}</span>
            </Button>
          </nav>
        </header>

        {/* Content */}
        <div
          className={`app-shell-content ${layoutStyles.extracted43}`}
          ref={contentRef}

        >
          {children}
        </div>

        <Modal open={Boolean(pendingNavigation)} onClose={handleStayOnPage} title="Unsaved changes" description={pendingNavigation?.message} size="sm" footer={<><Button variant="secondary" onClick={handleStayOnPage}>Stay on page</Button><Button variant="danger" onClick={handleLeaveWithoutSaving}>Leave without saving</Button>{pendingNavigation?.canSave ? <Button onClick={handleSaveAndLeave}>{pendingNavigation.saveLabel}</Button> : null}</>} />

        {/* Footer */}
        <footer className={layoutStyles.footer}>
          <span>Copyright {new Date().getFullYear()} {appearance.theme.appName} v{APP_VERSION_LABEL}</span>
          <div
            className={layoutStyles.extracted41}
          >
            {/* style-audit-allow runtime: access state tone */}
            <span className={layoutStyles.accessPill} style={{ "--access-border": pageAccessTone.border, "--access-background": pageAccessTone.background, "--access-text": pageAccessTone.text }}
              title={pageAccess.detail}
              aria-label={`Page access ${pageAccess.label}: ${pageAccess.detail}`}
            >
              {/* style-audit-allow runtime: access state dot */}
              <span className={layoutStyles.accessDot} style={{ "--access-dot": pageAccessTone.dot }} />
              Page: {pageAccess.label}
            </span>
            {/* style-audit-allow runtime: data-access state tone */}
            <span className={layoutStyles.accessPill} style={{ "--access-border": dataAccessTone.border, "--access-background": dataAccessTone.background, "--access-text": dataAccessTone.text }}
              title={dataAccess.detail}
              aria-label={`Data access ${dataAccess.label}: ${dataAccess.detail}`}
            >
              {/* style-audit-allow runtime: data-access state dot */}
              <span className={layoutStyles.accessDot} style={{ "--access-dot": dataAccessTone.dot }} />
              Data: {dataAccess.label}
            </span>
            {canSeePlatformAdmin ? (
              <Button bare
                type="button"
                onClick={() => attemptNavigation(() => router.push("/platform-admin"))}
                className={layoutStyles.extracted42}
                title="Open Platform Admin"
              >
                Platform
              </Button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
