"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { Inter } from "next/font/google";
import {
  onSnapshot,
  collection,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/app/utils/firebaseClient";
import {
  getStoredActiveWorkspace,
  getWorkspaceForPath,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import { hasAuthenticatorMfa, isPhoneVerified } from "@/app/utils/authSecurity";
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

const UI = {
  shellBg: "radial-gradient(circle at top left, #cfd8e3 0%, #bcc7d4 34%, #aebac7 100%)",
  sidebarBg: "#000000",
  sidebarBorder: "rgba(255,255,255,0.14)",
  sidebarMuted: "#b4c0cf",
  sidebarText: "#f8fbff",
  sidebarActiveBg: "rgba(255,255,255,0.08)",
  sidebarActiveBorder: "rgba(133,211,155,0.44)",
  activeAccent: "#6bb37f",
  topbarBg: "#000000",
  topbarBorder: "rgba(255,255,255,0.12)",
  contentBg: "transparent",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  success: "#6bb37f",
  text: "#0f172a",
  muted: "#5f6f82",
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

export default function HeaderSidebarLayout({
  children,
  showBackButton,
  backHref,
  backLabel = "Back",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userDoc, employeeAccess, isAdmin, logout } = useAuth() || {};

  const [showMenu, setShowMenu] = useState(false); // (kept)
  const [activeWorkspace, setActiveWorkspace] = useState("user");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  //  HR notification state
  const [hrNotif, setHrNotif] = useState({ requests: 0, deletes: 0 });

  const unsubHrRef = useRef(null);
  const contentRef = useRef(null);
  const pendingNavigationRef = useRef(null);

  const currentWorkspace = useMemo(() => getWorkspaceForPath(pathname), [pathname]);

  //  single source of truth for whether Admin tab should show
  const canSeeAdmin = !!isAdmin;

  //  HR badge should show for admins only
  const canSeeHrBadge = !!isAdmin;

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


    const hrRequestQuery = query(
      collection(db, "holidays"),
      where("status", "in", ["requested", "delete_requested", "delete-requested"]),
      limit(100)
    );
    unsubHrRef.current = onSnapshot(hrRequestQuery, (qs) => {
      let requested = 0;
      let deleteReq = 0;

        const CURRENT_YEAR = new Date().getFullYear();

        qs.forEach((d) => {
          const h = d.data() || {};
          const st = String(h.status || "").trim().toLowerCase();

          //  match HR logic: only count if start/end are valid and same year
          const y = holidayYearBucket(h);
          if (y !== CURRENT_YEAR) return;

          if (st === "requested") requested += 1;
          if (st === "delete_requested" || st === "delete-requested")
            deleteReq += 1;
        });

        setHrNotif({ requests: requested, deletes: deleteReq });
      });

    return () => {
      if (unsubHrRef.current) {
        unsubHrRef.current();
        unsubHrRef.current = null;
      }
    };
  }, [canSeeHrBadge]);

  /* -------------------------------------------
     NAV DEFINITIONS
  -------------------------------------------- */
  const userHeaderLinks = [
    { label: "Workshop", path: "/workshop" },
    { label: "Assistant", path: "/assistant", icon: "AI" },
    { label: "Wall View", path: "/wall-view" },
    { label: "Dashboard", path: "/dashboard" },
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

  const workspaceNavGroups = userSidebarGroups;
  const workspaceNav = workspaceNavGroups.flatMap((group) => group.items);
  const headerLinks = userHeaderLinks;

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
            .join(" � "),
    };
  }, [user?.emailVerified, userDoc]);

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
        background: UI.shellBg,
      }}
    >
      {/* ----------------- Sidebar ----------------- */}
      <aside
        style={{
          width: isCollapsed ? "60px" : "220px",
          flexShrink: 0,
          boxSizing: "border-box",
          background: UI.sidebarBg,
          color: UI.sidebarText,
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
            color: UI.sidebarMuted,
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
            style={{
              padding: "4px 6px 18px",
              marginBottom: 12,
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <img
              src="/bickers-action-logo.png"
              alt="Logo"
              style={{ width: 136, marginBottom: 14, display: "block" }}
            />
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Booking System
            </div>
            <div style={{ fontSize: 12.5, color: UI.sidebarMuted, marginTop: 4, lineHeight: 1.4 }}>
              Operations platform
            </div>
          </div>
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: UI.sidebarText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
              margin: "0 auto 18px",
            }}
          >
            BA
          </div>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {workspaceNavGroups.map((group) => (
            <div key={group.heading}>
              {!isCollapsed && (
                <div
                  style={{
                    padding: "0 10px 8px",
                    color: "rgba(255,255,255,0.46)",
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {group.heading}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                        background: active ? UI.sidebarActiveBg : "transparent",
                        border: active
                          ? `1px solid ${UI.sidebarActiveBorder}`
                          : "1px solid transparent",
                        color: active ? UI.sidebarText : UI.sidebarMuted,
                        fontSize: "14px",
                        textAlign: isCollapsed ? "center" : "left",
                        padding: isCollapsed ? "10px 8px" : "11px 14px",
                        cursor: "pointer",
                        position: "relative",
                        borderRadius: 12,
                        fontWeight: active ? 700 : 600,
                        boxShadow: active ? `inset 3px 0 0 ${UI.activeAccent}` : "none",
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
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                          }}
                        >
                          <span>{label}</span>
                          {showHrBadge && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 18,
                                height: 18,
                                padding: "0 6px",
                                borderRadius: 999,
                                background: UI.success,
                                color: "#102217",
                                fontSize: 11,
                                fontWeight: 900,
                                lineHeight: "18px",
                                marginLeft: "auto",
                              }}
                            >
                              {hrBadgeTotal}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          �
                        </span>
                      )}

                      {isCollapsed && showHrBadge && (
                        <span
                          style={{
                            position: "absolute",
                            right: 10,
                            top: 10,
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: UI.success,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ marginTop: "auto" }}>
          <button
            onClick={() => attemptNavigation(handleLogout)}
            style={{
              background: "none",
              border: "none",
              color: "#aaa",
              padding: "10px 16px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {isCollapsed ? "LO" : "Logout"}
          </button>
        </div>
      </aside>

      {/* ----------------- Main ----------------- */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <header
          style={{
            minHeight: "62px",
            background: UI.topbarBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "none",
            boxShadow: "0 12px 30px rgba(2,6,23,0.16)",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            {shouldShowBackButton && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  border: `1px solid ${UI.topbarBorder}`,
                  background: "rgba(255,255,255,0.04)",
                  color: "#f8fbff",
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
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "rgba(255,255,255,0.44)",
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                User workspace
              </div>
              <div
                style={{
                  color: "#f8fbff",
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentNavItem?.label || "Bickers Booking System"}
              </div>
            </div>
          </div>

          <nav
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: accountSetup.complete ? "8px 12px" : "7px 12px",
                borderRadius: 999,
                background: accountSetup.complete
                  ? "rgba(107,179,127,0.14)"
                  : "rgba(248,113,113,0.12)",
                border: accountSetup.complete
                  ? "1px solid rgba(107,179,127,0.38)"
                  : "1px solid rgba(248,113,113,0.28)",
                color: accountSetup.complete ? "#d7f6e0" : "#ffd6d6",
              }}
              title={accountSetup.complete ? accountSetup.detail : `Missing: ${accountSetup.detail}`}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: accountSetup.complete ? UI.success : "#f87171",
                  boxShadow: accountSetup.complete
                    ? "0 0 0 4px rgba(107,179,127,0.14)"
                    : "0 0 0 4px rgba(248,113,113,0.12)",
                }}
              />
              <div style={{ display: "grid", gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em" }}>
                  {accountSetup.label}
                </span>
                {!accountSetup.complete && (
                  <span style={{ fontSize: 10.5, color: "#f8b4b4" }}>
                    Missing: {accountSetup.detail}
                  </span>
                )}
              </div>
            </div>

            {headerLinks.map(({ label, path, icon }) => (
              <Link
                key={label}
                href={path}
                onClick={(event) => {
                  event.preventDefault();
                  attemptNavigation(() => router.push(path));
                }}
                style={{
                  color: pathname === path ? UI.activeAccent : "#a8b3c2",
                  fontSize: "12.5px",
                  textDecoration: "none",
                  fontWeight: pathname === path ? 700 : 600,
                  paddingBottom: 2,
                  borderBottom:
                    pathname === path ? `2px solid ${UI.activeAccent}` : "2px solid transparent",
                  display: "inline-flex",
                  alignItems: "center",
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
                          ? `1px solid ${UI.activeAccent}`
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
          className="app-shell-content"
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            background: UI.contentBg,
            padding: 0,
          }}
        >
          {children}
        </div>

        {pendingNavigation ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.48)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 90,
            }}
          >
            <div
              style={{
                width: "min(460px, 100%)",
                background: "#ffffff",
                borderRadius: 18,
                border: "1px solid #dbe3ee",
                boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
                padding: 20,
                color: UI.text,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
                Unsaved changes
              </div>
              <div style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.5 }}>
                {pendingNavigation.message}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleStayOnPage}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: UI.text,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Stay on page
                </button>
                <button
                  type="button"
                  onClick={handleLeaveWithoutSaving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#9f1239",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
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
                      border: `1px solid ${UI.brand}`,
                      background: UI.brand,
                      color: "#fff",
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
            background: "#000000",
            minHeight: "26px",
            fontSize: "10px",
            color: "#d0dae6",
            textAlign: "center",
            borderTop: `1px solid ${UI.topbarBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Copyright {new Date().getFullYear()} Bickers Booking System v3.0.5
        </footer>
      </div>
    </div>
  );
}
