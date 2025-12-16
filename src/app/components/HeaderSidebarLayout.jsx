"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Inter } from "next/font/google";
import { getAuth } from "firebase/auth";
import dynamic from "next/dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function HeaderSidebarLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false); // 🔹 collapsible sidebar

  const headerLinks = [
    { label: "Workshop", path: "/workshop" },
    { label: "Wall View", path: "/wall-view" },
    { label: "Dashboard", path: "/dashboard" },
  ];
  const sidebarItems = [
    { label: "Home", path: "/home" },
    { label: "Diary", path: "/dashboard" },
    { label: "U-Crane", path: "/u-crane" }, 

    { label: "Bookings", path: "/booking-page" },
    { label: "HR / Timesheets", path: "/hr" },
    { label: "Employees", path: "/employee-home" },
    { label: "Vehicles & Equip", path: "/vehicle-home" },
    { label: "Jobs Sheets", path: "/job-home" },
    { label: "Invoicing", path: "/finance-dashboard" },
    { label: "Statistics", path: "/statistics" },
    { label: "Settings", path: "/settings" },
    { label: "Logout", path: "/login" },
  ];


  const [theme, setTheme] = useState("system");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      applyTheme(savedTheme);
      setTheme(savedTheme);
    } else {
      applyTheme("system");
    }
  }, []);

  const applyTheme = (selectedTheme) => {
    const root = document.documentElement;

    if (selectedTheme === "light") {
      root.classList.remove("dark");
      document.body.style.backgroundColor = "#ffffff";
    } else if (selectedTheme === "dark") {
      root.classList.add("dark");
      document.body.style.backgroundColor = "#121212";
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
        document.body.style.backgroundColor = "#121212";
      } else {
        root.classList.remove("dark");
        document.body.style.backgroundColor = "#ffffff";
      }
    }

    localStorage.setItem("theme", selectedTheme);
    setTheme(selectedTheme);
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const themeButtonStyle = {
    backgroundColor: "#2c2c2e",
    border: "1px solid #444",
    borderRadius: "0px",
    padding: "6px",
    cursor: "pointer",
    flex: 1,
    fontSize: "14px",
  };

  const menuItemStyle = {
    display: "block",
    padding: "8px 0",
    textDecoration: "none",
    color: "#fff",
    fontSize: "13px",
    borderBottom: "1px solid #333",
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
      {/* Sidebar */}
      <aside
        style={{
          width: isCollapsed ? "60px" : "220px", // 🔹 collapsible width
          backgroundColor: "#000",
          color: "#fff",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          borderTopRightRadius: "0px",
          borderBottomRightRadius: "0px",
          boxShadow: "inset -1px 0 0 rgba(255, 255, 255, 0.1)",
          transition: "width 0.3s ease",
        }}
      >
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: "none",
            border: "none",
            color: "#4caf50",
            cursor: "pointer",
            fontSize: "16px",
            marginBottom: "20px",
            textAlign: "left",
          }}
        >
          {isCollapsed ? ">" : "<"}
        </button>

        {/* Logo only if expanded */}
        {!isCollapsed && (
          <img
            src="/bickers-action-logo.png"
            alt="Logo"
            style={{
              width: 150,
              marginBottom: 40,
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          />
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sidebarItems
              .filter(({ label }) => label !== "Logout")
              .map(({ label, path }) => (
                <button
                  key={label}
                  onClick={() => router.push(path)}
                  style={{
                    background: pathname === path ? "#2c2c2c" : "none",
                    border: pathname === path ? "1px solid #4caf50" : "none",
                    color: pathname === path ? "#fff" : "#aaa",
                    fontWeight: pathname === path ? "bold" : "normal",
                    fontSize: "14px",
                    textAlign: isCollapsed ? "center" : "left",
                    cursor: "pointer",
                    padding: "10px 16px",
                    borderRadius: "0px",
                    transition: "all 0.2s ease",
                  }}
                >
                  {!isCollapsed && label}

                </button>
              ))}
          </nav>

          <div style={{ marginTop: "auto" }}>
            <button
              onClick={() => router.push("/login")}
              style={{
                background: pathname === "/login" ? "#2c2c2c" : "none",
                border: pathname === "/login" ? "1px solid #4caf50" : "none",
                color: pathname === "/login" ? "#fff" : "#aaa",
                fontWeight: pathname === "/login" ? "bold" : "normal",
                fontSize: "14px",
                textAlign: isCollapsed ? "center" : "left",
                cursor: "pointer",
                padding: "10px 16px",
                borderRadius: "0px",
                transition: "all 0.2s ease",
              }}
            >
              {isCollapsed ? "⏻" : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header
          style={{
            height: "50px",
            backgroundColor: "#000",
            color: "#333333",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)",
            position: "sticky",
            top: 0,
            zIndex: 1000,
            borderTopLeftRadius: "0px",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "16px", whiteSpace: "nowrap" }}></div>

          <div style={{ display: "flex", alignItems: "center", gap: "30px" }}>
            <nav style={{ display: "flex", gap: "24px" }}>
              {headerLinks.map(({ label, path }) => (
                <Link
                  key={label}
                  href={path}
                  style={{
                    color: pathname === path ? "#4caf50" : "#B2B3C0",
                    fontWeight: pathname === path ? "bold" : "normal",
                    textDecoration: "none",
                    fontSize: "12px",
                  }}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "0px",
                    backgroundColor: "#4caf50",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                  }}
                >
                  {(user?.displayName || user?.email || "U")
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")}
                </div>
              </button>

              {showMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "110%",
                    right: 0,
                    backgroundColor: "#1c1c1e",
                    color: "#fff",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                    borderRadius: "0px",
                    padding: "12px",
                    minWidth: "240px",
                    zIndex: 1002,
                  }}
                >
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                      {user?.displayName || "User"}
                    </div>
                    <div style={{ fontSize: "13px", color: "#aaa" }}>
                      {user?.email || "email@example.com"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <button
                      title="Light"
                      onClick={() => applyTheme("light")}
                      style={{
                        ...themeButtonStyle,
                        backgroundColor: theme === "light" ? "#4caf50" : "#2c2c2e",
                      }}
                    >
                      ☀️
                    </button>
                    <button
                      title="Dark"
                      onClick={() => applyTheme("dark")}
                      style={{
                        ...themeButtonStyle,
                        backgroundColor: theme === "dark" ? "#4caf50" : "#2c2c2e",
                      }}
                    >
                      🌙
                    </button>
                    <button
                      title="System"
                      onClick={() => applyTheme("system")}
                      style={{
                        ...themeButtonStyle,
                        backgroundColor: theme === "system" ? "#4caf50" : "#2c2c2e",
                      }}
                    >
                      🖥️
                    </button>
                  </div>

                  <Link href="/settings" style={menuItemStyle}>
                    Manage cookies
                  </Link>
                  <Link href="/profile" style={menuItemStyle}>
                    Your profile
                  </Link>
                  <Link href="/terms" style={menuItemStyle}>
                    Terms & policies
                  </Link>
                  <Link href="/login" style={menuItemStyle}>
                    Log out
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            backgroundColor: "#f4f4f5",
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
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "8px",
            flexShrink: 0,
            borderBottomLeftRadius: "0px",
          }}
        >
          © {new Date().getFullYear()} Bickers Booking System
        </footer>
      </div>

      {/* Floating Wall View Button */}
      <button
        onClick={() => router.push("/wall-view")}
        style={{
          position: "fixed",
          top: "14px",
          left: isCollapsed ? "90px" : "250px", // 🔹 shift with collapse
          zIndex: 900,
          backgroundColor: "#e11d48",
          color: "#fff",
          border: "none",
          borderRadius: "0px",
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: "bold",
          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
          cursor: "pointer",
          transition: "left 0.3s ease",
        }}
      >
        Wall View
      </button>
    </div>
  );
}
