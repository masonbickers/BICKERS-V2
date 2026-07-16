"use client";

import layoutStyles from "./header.styles.module.css";import Link from "next/link";
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
      className={layoutStyles.extracted1}
    >
      <div className={layoutStyles.extracted2}>
        Bickers Booking System
      </div>

      <div className={layoutStyles.extracted3}>
        <nav className={layoutStyles.extracted4}>
          {navLinks.map(({ label, path }) => (
            <Link
              key={label}
              href={path}
              style={{
                color: pathname === path ? "var(--color-success-accent)" : "var(--color-white)",
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
        <div className={layoutStyles.extracted5}>
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            className={layoutStyles.extracted6}
          >
            <img
              src="/user-icon.png" // replace with your icon
              alt="User"
              className={layoutStyles.extracted7}
            />
            <span>Mason</span>
          </button>

          {showMenu && (
            <div
              className={layoutStyles.extracted8}
            >
              <Link
                href="/settings"
                className={layoutStyles.extracted9}
              >
                Settings
              </Link>
              <Link
                href="/login"
                className={layoutStyles.extracted10}
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
