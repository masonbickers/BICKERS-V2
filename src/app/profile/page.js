"use client";

import { useEffect, useState } from "react";
import { auth } from "../../../firebaseConfig";
import { updateProfile } from "firebase/auth";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setDisplayName(currentUser?.displayName || "");
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser || !displayName.trim()) return;
    try {
      await updateProfile(auth.currentUser, { displayName });
      setUser({ ...auth.currentUser, displayName });
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setStatus("Error saving.");
    }
  };

  const renderAvatar = () => {
    const initial = user?.displayName?.charAt(0)?.toUpperCase() || "U";
    return (
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          backgroundColor: "#4caf50",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          fontWeight: "bold",
          textTransform: "uppercase",
        }}
      >
        {initial}
      </div>
    );
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ backgroundColor: "#f4f4f5", minHeight: "100vh", padding: "40px 16px" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "32px", color: "#111" }}>
            Account Settings
          </h1>

          {user ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                backgroundColor: "#fff",
                padding: "32px",
                borderRadius: "12px",
                boxShadow: "0 0 0 1px #ddd",
              }}
            >
              <div style={{ marginBottom: "16px", alignSelf: "center" }}>{renderAvatar()}</div>

              <div>
                <label style={{ fontSize: "14px", color: "#333" }}>Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Name"
                  style={{
                    width: "100%",
                    marginTop: "6px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    backgroundColor: "#fafafa",
                    color: "#333",
                    fontSize: "14px",
                  }}
                />
                <small style={{ color: "#666", fontSize: "12px" }}>
                  The name associated with this account
                </small>
              </div>

              <div>
                <label style={{ fontSize: "14px", color: "#333" }}>Email address</label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  style={{
                    width: "100%",
                    marginTop: "6px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    backgroundColor: "#fafafa",
                    color: "#888",
                    fontSize: "14px",
                  }}
                />
                <small style={{ color: "#666", fontSize: "12px" }}>
                  The email address associated with this account
                </small>
              </div>

              <div>
                <label style={{ fontSize: "14px", color: "#333" }}>Phone number</label>
                <input
                  type="text"
                  value={user.phoneNumber || "+44"}
                  disabled
                  style={{
                    width: "100%",
                    marginTop: "6px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    backgroundColor: "#fafafa",
                    color: "#888",
                    fontSize: "14px",
                  }}
                />
                <small style={{ color: "#666", fontSize: "12px" }}>
                  The phone number associated with this account
                </small>
              </div>

              <button
                onClick={handleSave}
                style={{
                  marginTop: "10px",
                  padding: "10px 20px",
                  backgroundColor: "#bfbfbf",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "14px",
                  alignSelf: "flex-start",
                }}
              >
                Save
              </button>

              {status && (
                <p style={{ color: "#4caf50", fontSize: "13px", marginTop: "-12px" }}>{status}</p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: "14px", color: "#555" }}>Loading user data...</p>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
