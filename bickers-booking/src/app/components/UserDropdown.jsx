"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UserDropdown({ name = "Mason Bickers", email = "masonbickers8@icloud.com" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div style={{ position: "relative", marginLeft: "auto" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: "10px 14px",
          borderRadius: "50%",
          background: "#333",
          color: "#fff",
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
          background: "#1f1f1f",
          color: "#fff",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 1000,
          width: "220px",
          padding: "10px"
        }}>
          <div style={{ borderBottom: "1px solid #444", paddingBottom: "8px", marginBottom: "8px" }}>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: "0.85rem", color: "#aaa" }}>{email}</div>
          </div>
          <div style={{ padding: "8px 0", cursor: "pointer" }}>⚙️ Settings</div>
          <div style={{ padding: "8px 0", cursor: "pointer" }} onClick={() => router.push("/profile")}>👤 Profile</div>
          <div style={{ padding: "8px 0", cursor: "pointer" }} onClick={() => router.push("/login")}>🚪 Log out</div>
        </div>
      )}
    </div>
  );
}
