"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";

export default function UserDropdown({ name = "Mason Bickers", email = "masonbickers8@icloud.com" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { logout } = useAuth() || {};

  return (
    <div style={{ position: "relative", marginLeft: "auto" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: "10px 14px",
          borderRadius: "50%",
          background: "var(--legacy-color-333)",
          color: "var(--color-white)",
          cursor: "pointer",
          userSelect: "none"
        }}
      >
        M
      </div>

      {open && (
        <div style={{
          position: "absolute",
          top: "110%",
          right: 0,
          background: "var(--legacy-color-1f1f1f)",
          color: "var(--color-white)",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 1000,
          width: "220px",
          padding: "10px"
        }}>
          <div style={{ borderBottom: "1px solid var(--legacy-color-444)", paddingBottom: "8px", marginBottom: "8px" }}>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: "0.85rem", color: "var(--legacy-color-aaa)" }}>{email}</div>
          </div>
          <div style={{ padding: "8px 0", cursor: "pointer" }}>Settings</div>
          <div style={{ padding: "8px 0", cursor: "pointer" }} onClick={() => router.push("/profile")}>Profile</div>
          <div style={{ padding: "8px 0", cursor: "pointer" }} onClick={() => logout?.()}>Log out</div>
        </div>
      )}
    </div>
  );
}
