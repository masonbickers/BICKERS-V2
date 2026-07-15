"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);

  const navLinks = [
    { label: "Playground", path: "/playground" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Docs", path: "/docs" },
    { label: "API Reference", path: "/api-reference" },
  ];

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "60px",
        backgroundColor: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        zIndex: 1000,
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "16px", whiteSpace: "nowrap" }}>
        Bickers Booking System
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "30px" }}>
        <nav style={{ display: "flex", gap: "24px" }}>
          {navLinks.map(({ label, path }) => (
            <Link
              key={label}
              href={path}
              style={{
                color: pathname === path ? "#4caf50" : "#fff",
                fontWeight: pathname === path ? "bold" : "normal",
                textDecoration: "none",
                fontSize: "14px",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* User Menu */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <img
              src="/user-icon.png" // replace with your icon
              alt="User"
              style={{ width: 28, height: 28, borderRadius: "50%" }}
            />
            <span>Mason</span>
          </button>

          {showMenu && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                right: 0,
                backgroundColor: "#fff",
                color: "#000",
                boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                borderRadius: "6px",
                padding: "10px 0",
                minWidth: "160px",
                zIndex: 1001,
              }}
            >
              <Link
                href="/settings"
                style={{
                  display: "block",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "#000",
                  fontSize: "14px",
                  borderBottom: "1px solid #eee",
                }}
              >
                Settings
              </Link>
              <Link
                href="/login"
                style={{
                  display: "block",
                  padding: "10px 16px",
                  textDecoration: "none",
                  color: "#000",
                  fontSize: "14px",
                }}
              >
                Logout
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
