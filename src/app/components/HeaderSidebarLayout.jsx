"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { Inter } from "next/font/google";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  getWorkspaceForPath,
  resolveEmployeeAccess,
  selectLandingRoute,
  setStoredActiveWorkspace,
} from "@/app/utils/accessControl";
import { hasAuthenticatorMfa, isPhoneVerified } from "@/app/utils/authSecurity";

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
   Admin allow-list (same as HR page)
------------------------------------------- */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];


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
  const auth = getAuth();

  const [showMenu, setShowMenu] = useState(false); // (kept)
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [employeeAccess, setEmployeeAccess] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState("user");
  const [isCollapsed, setIsCollapsed] = useState(false);

  //  HR notification state
  const [hrNotif, setHrNotif] = useState({ requests: 0, deletes: 0 });

  const unsubUserRef = useRef(null);
  const unsubHrRef = useRef(null);

  const emailLower = useMemo(
    () => String(user?.email || "").trim().toLowerCase(),
    [user?.email]
  );

  const currentWorkspace = useMemo(() => getWorkspaceForPath(pathname), [pathname]);

  //  single source of truth for whether Admin tab should show
  const canSeeAdmin = useMemo(() => {
    return ADMIN_EMAILS.includes(emailLower) || userDoc?.role === "admin";
  }, [emailLower, userDoc?.role]);

  //  HR badge should show for admins only
  const canSeeHrBadge = useMemo(() => {
    return ADMIN_EMAILS.includes(emailLower) || userDoc?.role === "admin";
  }, [emailLower, userDoc?.role]);

  /* -------------------------------------------
     Locked AUTH + LIVE DISABLE GUARD (robust user doc resolution)
  -------------------------------------------- */
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      // clean old snapshots
      if (unsubUserRef.current) {
        unsubUserRef.current();
        unsubUserRef.current = null;
      }
      if (unsubHrRef.current) {
        unsubHrRef.current();
        unsubHrRef.current = null;
      }

      setUser(currentUser);

      if (!currentUser) {
        setUserDoc(null);
        setEmployeeAccess(null);
        setActiveWorkspace("user");
        setHrNotif({ requests: 0, deletes: 0 });
        return;
      }

      // 1) Try users/{uid} (best practice)
      let resolvedRef = doc(db, "users", currentUser.uid);
      let snap = await getDoc(resolvedRef);

      // 2) If missing, fall back to finding user doc by email
      if (!snap.exists()) {
        const emailA = String(currentUser.email || "").trim();
        const emailB = emailA.toLowerCase();

        const q1 = query(
          collection(db, "users"),
          where("email", "==", emailA),
          limit(1)
        );
        const r1 = await getDocs(q1);

        if (!r1.empty) {
          resolvedRef = doc(db, "users", r1.docs[0].id);
          snap = r1.docs[0];
        } else {
          const q2 = query(
            collection(db, "users"),
            where("email", "==", emailB),
            limit(1)
          );
          const r2 = await getDocs(q2);

          if (!r2.empty) {
            resolvedRef = doc(db, "users", r2.docs[0].id);
            snap = r2.docs[0];
          }
        }
      }

      const nextUserDoc = snap?.exists?.() ? snap.data() : null;
      setUserDoc(nextUserDoc);

      const employeeDoc = await findEmployeeForUser(db, currentUser);
      const nextAccess = resolveEmployeeAccess(employeeDoc || {}, {
        isAdmin:
          ADMIN_EMAILS.includes(String(currentUser.email || "").trim().toLowerCase()) ||
          nextUserDoc?.role === "admin",
      });
      setEmployeeAccess(nextAccess);

      const storedWorkspace =
        getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
        getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);
      setActiveWorkspace(
        storedWorkspace === "service" && nextAccess.hasServiceAccess
          ? "service"
          : storedWorkspace === "user" && nextAccess.hasUserAccess
            ? "user"
            : nextAccess.defaultWorkspace
      );

      //  LIVE WATCH � force logout if disabled (only if we resolved a doc)
      unsubUserRef.current = onSnapshot(resolvedRef, async (docSnap) => {
        const data = docSnap.data();
        setUserDoc(data);
        setEmployeeAccess(
          resolveEmployeeAccess(employeeDoc || {}, {
            isAdmin:
              ADMIN_EMAILS.includes(String(currentUser.email || "").trim().toLowerCase()) ||
              data?.role === "admin",
          })
        );

        if (data?.isEnabled === false) {
          await signOut(auth);
          router.replace("/login?disabled=1");
        }
      });

      //  LIVE HR NOTIFICATION � match HR year bucketing rules
      unsubHrRef.current = onSnapshot(collection(db, "holidays"), (qs) => {
        let requested = 0;
        let deleteReq = 0;

        const CURRENT_YEAR = new Date().getFullYear();

        qs.forEach((d) => {
          const h = d.data() || {};
          const st = String(h.status || "").trim().toLowerCase();

          //  match HR logic: only count if start/end are valid and same year
          const y = holidayYearBucket(h);
          if (y !== CURRENT_YEAR) return;

          if (st === "requested" || !st) requested += 1;
          if (st === "delete_requested" || st === "delete-requested")
            deleteReq += 1;
        });

        setHrNotif({ requests: requested, deletes: deleteReq });
      });
    });

    return () => {
      unsubAuth();
      if (unsubUserRef.current) unsubUserRef.current();
      if (unsubHrRef.current) unsubHrRef.current();
    };
  }, [auth, router]);

  /* -------------------------------------------
     NAV DEFINITIONS
  -------------------------------------------- */
  const userHeaderLinks = [
    { label: "Workshop", path: "/workshop" },
    { label: "Wall View", path: "/wall-view" },
    { label: "Dashboard", path: "/dashboard" },
    ...(canSeeAdmin ? [{ label: "Admin", path: "/admin" }] : []),
  ];

  const serviceHeaderLinks = [
    { label: "Workshop", path: "/workshop" },
    { label: "Service Overview", path: "/service-overview" },
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
        { label: "Invoicing", path: "/finance-dashboard" },
        { label: "Statistics", path: "/statistics" },
        { label: "Settings", path: "/settings" },
      ],
    },
  ];

  const serviceSidebarGroups = [
    {
      heading: "Service",
      items: [
        { label: "Service Home", path: "/service/home" },
        { label: "Service Overview", path: "/service-overview" },
        { label: "Workshop", path: "/workshop" },
        { label: "Maintenance Jobs", path: "/maintenance-jobs" },
      ],
    },
    {
      heading: "Fleet",
      items: [
        { label: "Vehicles & Equip", path: "/vehicle-home" },
        { label: "MOT Overview", path: "/mot-overview" },
        { label: "Vehicle Checks", path: "/vehicle-checks" },
        { label: "Usage Overview", path: "/usage-overview" },
      ],
    },
    {
      heading: "System",
      items: [{ label: "Settings", path: "/settings" }],
    },
  ];

  const workspaceNavGroups =
    activeWorkspace === "service" ? serviceSidebarGroups : userSidebarGroups;
  const workspaceNav = workspaceNavGroups.flatMap((group) => group.items);
  const headerLinks = activeWorkspace === "service" ? serviceHeaderLinks : userHeaderLinks;

  /* -------------------------------------------
     LOGOUT
  -------------------------------------------- */
  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
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
        (path === "/service/home" && pathname === "/service-home")
      ) || null
    );
  }, [pathname, workspaceNav]);

  const landingRoute = useMemo(() => {
    if (!employeeAccess) return "/dashboard";
    return selectLandingRoute(employeeAccess, activeWorkspace);
  }, [employeeAccess, activeWorkspace]);

  const shouldShowBackButton = useMemo(() => {
    if (typeof showBackButton === "boolean") return showBackButton;
    if (!pathname) return false;
    return pathname !== landingRoute;
  }, [showBackButton, pathname, landingRoute]);

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(landingRoute);
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
              {activeWorkspace === "service" ? "Service Platform" : "Booking System"}
            </div>
            <div style={{ fontSize: 12.5, color: UI.sidebarMuted, marginTop: 4, lineHeight: 1.4 }}>
              {activeWorkspace === "service" ? "Workshop and fleet operations" : "Operations platform"}
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
                    (path === "/service/home" && pathname === "/service-home");

                  const isHrItem = path === "/hr";
                  const showHrBadge = isHrItem && canSeeHrBadge && hrBadgeTotal > 0;
                  return (
                    <button
                      key={label}
                      onClick={() => router.push(path)}
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
            onClick={handleLogout}
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
                {activeWorkspace === "service" ? "Service workspace" : "User workspace"}
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

            {headerLinks.map(({ label, path }) => (
              <Link
                key={label}
                href={path}
                style={{
                  color: pathname === path ? UI.activeAccent : "#a8b3c2",
                  fontSize: "12.5px",
                  textDecoration: "none",
                  fontWeight: pathname === path ? 700 : 600,
                  paddingBottom: 2,
                  borderBottom:
                    pathname === path ? `2px solid ${UI.activeAccent}` : "2px solid transparent",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Content */}
        <div
          className="app-shell-content"
          style={{
            flex: 1,
            overflowY: "auto",
            background: UI.contentBg,
            padding: 0,
          }}
        >
          {children}
        </div>

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
          Copyright {new Date().getFullYear()} Bickers Booking System v3.0.4
        </footer>
      </div>
    </div>
  );
}
