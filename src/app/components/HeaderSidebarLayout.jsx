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

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

/* ───────────────────────────────────────────
   Admin allow-list (same as Admin page)
─────────────────────────────────────────── */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

export default function HeaderSidebarLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = getAuth();

  const [showMenu, setShowMenu] = useState(false); // (kept)
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ✅ NEW: live HR notification counts
  const [hrNotif, setHrNotif] = useState({
    pending: 0, // requested + missing status
    deletes: 0, // delete_requested
    total: 0,
  });

  const unsubUserRef = useRef(null);
  const unsubHolidaysRef = useRef(null);

  const emailLower = useMemo(
    () => String(user?.email || "").trim().toLowerCase(),
    [user?.email]
  );

  // ✅ single source of truth for whether Admin tab should show
  const canSeeAdmin = useMemo(() => {
    return ADMIN_EMAILS.includes(emailLower) || userDoc?.role === "admin";
  }, [emailLower, userDoc?.role]);

  /* ───────────────────────────────────────────
     🔒 AUTH + LIVE DISABLE GUARD (robust user doc resolution)
  ──────────────────────────────────────────── */
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      // clean old snapshot
      if (unsubUserRef.current) {
        unsubUserRef.current();
        unsubUserRef.current = null;
      }

      setUser(currentUser);

      if (!currentUser) {
        setUserDoc(null);
        return;
      }

      // 1) Try users/{uid} (best practice)
      let resolvedRef = doc(db, "users", currentUser.uid);
      let snap = await getDoc(resolvedRef);

      // 2) If missing, fall back to finding user doc by email
      if (!snap.exists()) {
        const emailA = String(currentUser.email || "").trim();
        const emailB = emailA.toLowerCase();

        // Try exact email match (case may vary in stored docs)
        const q1 = query(
          collection(db, "users"),
          where("email", "==", emailA),
          limit(1)
        );
        const r1 = await getDocs(q1);

        if (!r1.empty) {
          resolvedRef = doc(db, "users", r1.docs[0].id);
          snap = r1.docs[0]; // doc snapshot
        } else {
          // Try lowercased email match
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

      // initial set
      if (snap?.exists?.()) setUserDoc(snap.data());
      else setUserDoc(null);

      // 🔴 LIVE WATCH — force logout if disabled (only if we resolved a doc)
      unsubUserRef.current = onSnapshot(resolvedRef, async (docSnap) => {
        const data = docSnap.data();
        setUserDoc(data);

        if (data?.isEnabled === false) {
          await signOut(auth);
          router.replace("/login?disabled=1");
        }
      });
    });

    return () => {
      unsubAuth();
      if (unsubUserRef.current) unsubUserRef.current();
    };
  }, [auth, router]);

  /* ───────────────────────────────────────────
     ✅ NEW: LIVE HOLIDAY REQUEST NOTIFICATIONS (HR badge)
     Counts:
       - pending: status === "requested" OR missing status (your HR page treats missing as requested)
       - deletes: status === "delete_requested" OR "delete-requested"
  ──────────────────────────────────────────── */
  useEffect(() => {
    // clean old subscription
    if (unsubHolidaysRef.current) {
      unsubHolidaysRef.current();
      unsubHolidaysRef.current = null;
    }

    // Subscribe to ALL holidays (simple + robust; keeps badge accurate with your "missing status" logic)
    unsubHolidaysRef.current = onSnapshot(
      collection(db, "holidays"),
      (snap) => {
        let pending = 0;
        let deletes = 0;

        snap.forEach((docSnap) => {
          const h = docSnap.data() || {};
          const st = String(h.status || "").trim().toLowerCase();

          // your HR page treats missing status as requested
          const isPendingRequested = st === "requested" || !h.status;
          const isDeleteReq =
            st === "delete_requested" || st === "delete-requested";

          if (isPendingRequested) pending += 1;
          if (isDeleteReq) deletes += 1;
        });

        const total = pending + deletes;

        setHrNotif({ pending, deletes, total });
      },
      (err) => {
        console.error("Holiday badge listener error:", err);
        setHrNotif({ pending: 0, deletes: 0, total: 0 });
      }
    );

    return () => {
      if (unsubHolidaysRef.current) unsubHolidaysRef.current();
      unsubHolidaysRef.current = null;
    };
  }, []);

  /* ───────────────────────────────────────────
     NAV DEFINITIONS
  ──────────────────────────────────────────── */
  const headerLinks = [
    { label: "Workshop", path: "/workshop" },
    { label: "Wall View", path: "/wall-view" },
    { label: "Dashboard", path: "/dashboard" },
    ...(canSeeAdmin ? [{ label: "Admin", path: "/admin" }] : []),
  ];

  const sidebarItems = [
    { label: "Home", path: "/home" },
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
      else router.push("/dashboard");
    } catch {
      router.push("/dashboard");
    }
  };

  // ✅ Badge styles
  const badgeWrap = {
    position: "absolute",
    top: 6,
    right: 10,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  const badgeDot = (bg) => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    background: bg,
    boxShadow: "0 0 0 2px rgba(0,0,0,0.8)",
  });

  const badgePill = (bg) => ({
    minWidth: 18,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: bg,
    color: "#000",
    fontSize: 11,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  });

  return (
    <div
      className={inter.variable}
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "var(--font-inter)",
      }}
    >
      {/* ───────────────── Sidebar ───────────────── */}
      <aside
        style={{
          width: isCollapsed ? "60px" : "220px",
          backgroundColor: "#000",
          color: "#fff",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.1)",
          transition: "width 0.3s ease",
        }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: "none",
            border: "none",
            color: "#4caf50",
            cursor: "pointer",
            fontSize: "16px",
            marginBottom: "20px",
          }}
        >
          {isCollapsed ? ">" : "<"}
        </button>

        {!isCollapsed && (
          <img
            src="/bickers-action-logo.png"
            alt="Logo"
            style={{ width: 150, marginBottom: 40, margin: "0 auto" }}
          />
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sidebarItems.map(({ label, path }) => {
            const isActive = pathname === path;
            const isHR = path === "/hr";

            // ✅ Show badge when HR has anything pending
            const showHrBadge = isHR && hrNotif.total > 0;

            return (
              <button
                key={label}
                onClick={() => router.push(path)}
                style={{
                  position: "relative",
                  background: isActive ? "#2c2c2c" : "none",
                  border: isActive ? "1px solid #4caf50" : "none",
                  color: isActive ? "#fff" : "#aaa",
                  fontSize: "14px",
                  textAlign: isCollapsed ? "center" : "left",
                  padding: "10px 16px",
                  cursor: "pointer",
                }}
                title={
                  isHR && hrNotif.total > 0
                    ? `${hrNotif.pending} holiday requests, ${hrNotif.deletes} delete requests`
                    : undefined
                }
              >
                {/* label */}
                {!isCollapsed && label}

                {/* ✅ badge */}
                {showHrBadge && (
                  <span style={badgeWrap}>
                    {/* orange dot if delete requests exist, else green dot */}
                    <span
                      style={badgeDot(hrNotif.deletes > 0 ? "#fb923c" : "#4caf50")}
                    />
                    {!isCollapsed && (
                      <span
                        style={badgePill(
                          hrNotif.deletes > 0 ? "#fb923c" : "#4caf50"
                        )}
                      >
                        {hrNotif.total}
                      </span>
                    )}
                  </span>
                )}

                {/* ✅ collapsed view: just a number bubble centred */}
                {showHrBadge && isCollapsed && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 8,
                      minWidth: 18,
                      height: 18,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: hrNotif.deletes > 0 ? "#fb923c" : "#4caf50",
                      color: "#000",
                      fontSize: 11,
                      fontWeight: 900,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    {hrNotif.total}
                  </span>
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
            height: "50px",
            backgroundColor: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <button
            onClick={handleBack}
            style={{
              background: "none",
              border: "1px solid #333",
              color: "#fff",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            ← Back
          </button>

          <nav style={{ display: "flex", gap: 24 }}>
            {headerLinks.map(({ label, path }) => (
              <Link
                key={label}
                href={path}
                style={{
                  color: pathname === path ? "#4caf50" : "#aaa",
                  fontSize: "12px",
                  textDecoration: "none",
                  fontWeight: pathname === path ? "bold" : "normal",
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
            background: "#f4f4f5",
            padding: 10,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <footer
          style={{
            backgroundColor: "#000",
            height: "10px",
            fontSize: "8px",
            color: "#fff",
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} Bickers Booking System
        </footer>
      </div>
    </div>
  );
}
