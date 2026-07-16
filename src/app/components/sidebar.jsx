"use client";

import layoutStyles from "./sidebar.styles.module.css";import { usePathname, useRouter } from "next/navigation";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: "Home", path: "/home" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Bookings", path: "/booking-page" },
    { label: "HR", path: "/hr" },
    { label: "Employees", path: "/employee-home" },
    { label: "Vehicles", path: "/vehicle-home" },
    { label: "Settings", path: "/settings" },
    { label: "Logout", path: "/login" },
  ];

  return (
    <aside
      className={layoutStyles.extracted1}
    >
      <img
        src="/bickers-action-logo.png"
        alt="Logo"
        className={layoutStyles.extracted2}
      />

      <nav className={layoutStyles.extracted3}>
        {navItems.map(({ label, path }) => (
          <button
            key={label}
            onClick={() => router.push(path)}
            style={{
              background: "none",
              border: "none",
              color: pathname === path ? "var(--color-success-accent)" : "var(--color-white)",
              fontWeight: pathname === path ? "bold" : "normal",
              fontSize: "16px",
              textAlign: "left",
              cursor: "pointer",
              padding: "8px 0",
              borderBottom: "1px solid var(--color-text)",
              width: "100%",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
