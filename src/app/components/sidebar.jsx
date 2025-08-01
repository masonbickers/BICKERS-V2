"use client";
import { usePathname, useRouter } from "next/navigation";

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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "240px",
        height: "100vh",
        backgroundColor: "#000",
        color: "#fff",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <img
        src="/bickers-action-logo.png"
        alt="Logo"
        style={{ width: 180, marginBottom: 40 }}
      />

      <nav style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {navItems.map(({ label, path }) => (
          <button
            key={label}
            onClick={() => router.push(path)}
            style={{
              background: "none",
              border: "none",
              color: pathname === path ? "#4caf50" : "#fff",
              fontWeight: pathname === path ? "bold" : "normal",
              fontSize: "16px",
              textAlign: "left",
              cursor: "pointer",
              padding: "8px 0",
              borderBottom: "1px solid #333",
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
