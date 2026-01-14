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

  const [showMenu, setShowMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const unsubUserRef = useRef(null);

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
        // If you have a dedicated lowerEmail field, swap query to where("lowerEmail","==",emailB)
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
          {sidebarItems.map(({ label, path }) => (
            <button
              key={label}
              onClick={() => router.push(path)}
              style={{
                background: pathname === path ? "#2c2c2c" : "none",
                border: pathname === path ? "1px solid #4caf50" : "none",
                color: pathname === path ? "#fff" : "#aaa",
                fontSize: "14px",
                textAlign: isCollapsed ? "center" : "left",
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              {!isCollapsed && label}
            </button>
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
        <div style={{ flex: 1, overflowY: "auto", background: "#f4f4f5", padding: 10 }}>
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
