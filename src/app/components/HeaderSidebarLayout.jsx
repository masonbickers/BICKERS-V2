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

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const UI = {
  shellBg: "#e9eff5",
  sidebarBg: "#000000",
  sidebarBorder: "rgba(255,255,255,0.08)",
  sidebarMuted: "#9fb0c3",
  sidebarText: "#f4f7fb",
  sidebarActiveBg: "rgba(107,179,127,0.18)",
  sidebarActiveBorder: "#6bb37f",
  activeAccent: "#6bb37f",
  topbarBg: "#000000",
  topbarBorder: "rgba(255,255,255,0.08)",
  contentBg: "#eef3f8",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  success: "#6bb37f",
  text: "#0f172a",
  muted: "#5f6f82",
};

/* ───────────────────────────────────────────
   Admin allow-list (same as HR page)
─────────────────────────────────────────── */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

/* ───────────────────────────────────────────
   Date helpers (match HR page logic)
─────────────────────────────────────────── */
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

export default function HeaderSidebarLayout({ children }) {
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

  /* ───────────────────────────────────────────
     Locked AUTH + LIVE DISABLE GUARD (robust user doc resolution)
  ──────────────────────────────────────────── */
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

      //  LIVE WATCH — force logout if disabled (only if we resolved a doc)
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

      //  LIVE HR NOTIFICATION — match HR year bucketing rules
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

  /* ───────────────────────────────────────────
     NAV DEFINITIONS
  ──────────────────────────────────────────── */
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

  const userSidebarItems = [
    { label: "Home", path: "/screens/homescreen" },
    { label: "Diary", path: "/dashboard" },
    { label: "U-Crane", path: "/u-crane" },
    { label: "HR / Timesheets", path: "/hr" },
    { label: "Employees", path: "/employee-home" },
    { label: "Vehicles & Equip", path: "/vehicle-home" },
    { label: "Jobs Sheets", path: "/job-home" },
    { label: "Invoicing", path: "/finance-dashboard" },
    { label: "Statistics", path: "/statistics" },
    { label: "Settings", path: "/settings" },
  ];

  const serviceSidebarItems = [
    { label: "Service Home", path: "/service/home" },
    { label: "Service Overview", path: "/service-overview" },
    { label: "Vehicles & Equip", path: "/vehicle-home" },
    { label: "MOT Overview", path: "/mot-overview" },
    { label: "Vehicle Checks", path: "/vehicle-checks" },
    { label: "Usage Overview", path: "/usage-overview" },
    { label: "Workshop", path: "/workshop" },
    { label: "Maintenance Jobs", path: "/maintenance-jobs" },
    { label: "Settings", path: "/settings" },
  ];

  const workspaceNav = activeWorkspace === "service" ? serviceSidebarItems : userSidebarItems;
  const headerLinks = activeWorkspace === "service" ? serviceHeaderLinks : userHeaderLinks;

  /* ───────────────────────────────────────────
     LOGOUT
  ──────────────────────────────────────────── */
  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  /* ───────────────────────────────────────────
     BACK BUTTON
  ──────────────────────────────────────────── */
  const handleBack = () => {
    try {
      if (window.history.length > 1) router.back();
      else router.push(selectLandingRoute(employeeAccess || null, activeWorkspace));
    } catch {
      router.push(selectLandingRoute(employeeAccess || null, activeWorkspace));
    }
  };

  const handleWorkspaceSwitch = (workspace) => {
    if (!employeeAccess) return;
    if (workspace === "service" && !employeeAccess.hasServiceAccess) return;
    if (workspace === "user" && !employeeAccess.hasUserAccess) return;

    setActiveWorkspace(workspace);
    if (typeof window !== "undefined") {
      setStoredActiveWorkspace(window.localStorage, workspace);
      setStoredActiveWorkspace(window.sessionStorage, workspace);
    }
    router.push(selectLandingRoute(employeeAccess, workspace));
  };

  //  badge total (requested + delete)
  const hrBadgeTotal = useMemo(() => {
    return (hrNotif?.requests || 0) + (hrNotif?.deletes || 0);
  }, [hrNotif]);

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
        height: "100vh",
        overflow: "hidden",
        fontFamily: "var(--font-inter)",
        background: UI.shellBg,
      }}
    >
      {/* ───────────────── Sidebar ───────────────── */}
      <aside
        style={{
          width: isCollapsed ? "60px" : "220px",
          background: UI.sidebarBg,
          color: UI.sidebarText,
          padding: isCollapsed ? "18px 10px" : "22px 16px",
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${UI.sidebarBorder}`,
          transition: "width 0.3s ease",
        }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
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
              borderBottom: "1px solid rgba(255,255,255,0.08)",
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
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

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {workspaceNav.map(({ label, path }) => {
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
                    ? `${hrNotif.requests} holiday request(s), ${hrNotif.deletes} delete request(s)`
                    : undefined
                }
              >
                {!isCollapsed && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{label}</span>

                    {/*  HR notification badge */}
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
                        }}
                      >
                        {hrBadgeTotal}
                      </span>
                    )}
                  </span>
                )}

                {/* collapsed mode: tiny dot */}
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
            {isCollapsed ? "⏻" : "Logout"}
          </button>
        </div>
      </aside>

      {/* ───────────────── Main ───────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header
          style={{
            minHeight: "62px",
            backgroundColor: UI.topbarBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: `1px solid ${UI.topbarBorder}`,
            boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
          }}
        >
          <button
            onClick={handleBack}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${UI.topbarBorder}`,
              color: "#ffffff",
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: "12.5px",
              fontWeight: 700,
              borderRadius: 10,
            }}
          >
            ← Back
          </button>

          <nav
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {employeeAccess?.hasUserAccess && employeeAccess?.hasServiceAccess && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 3,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${UI.topbarBorder}`,
                }}
              >
                {["user", "service"].map((workspace) => (
                  <button
                    key={workspace}
                    type="button"
                    onClick={() => handleWorkspaceSwitch(workspace)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "none",
                      background: activeWorkspace === workspace ? UI.activeAccent : "transparent",
                      color: activeWorkspace === workspace ? "#102217" : "#d5deea",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {workspace === "user" ? "User" : "Service"}
                  </button>
                ))}
              </div>
            )}

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
          style={{
            flex: 1,
            overflowY: "auto",
            background: UI.contentBg,
            padding: 12,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <footer
          style={{
            backgroundColor: UI.topbarBg,
            minHeight: "26px",
            fontSize: "10px",
            color: UI.muted,
            textAlign: "center",
            borderTop: `1px solid ${UI.topbarBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          © {new Date().getFullYear()} Bickers Booking System
        </footer>
      </div>
    </div>
  );
}
