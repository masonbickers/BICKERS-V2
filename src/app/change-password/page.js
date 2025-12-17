"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../../../firebaseConfig";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const card = { ...surface, padding: 16 };

const fieldLabel = {
  fontSize: 12,
  fontWeight: 800,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
};
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
  outline: "none",
  color: UI.text,
};

const helper = { color: UI.muted, fontSize: 12, marginTop: 6 };

const btnBase = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const btnPrimary = { ...btnBase, background: UI.brand, borderColor: UI.brand, color: "#fff" };
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand };

export default function ChangePasswordPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email || "");
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const validate = () => {
    const cur = String(currentPassword || "");
    const next = String(newPassword || "");
    const conf = String(confirm || "");

    if (!cur) return "Enter your current password.";
    if (!next) return "Enter a new password.";
    if (next.length < 8) return "New password must be at least 8 characters.";
    if (next !== conf) return "New password and confirmation do not match.";
    if (next === cur) return "New password must be different from the current password.";
    return "";
  };

  const handleUpdate = async () => {
    setError("");
    setSuccess("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    if (!auth.currentUser || !auth.currentUser.email) {
      setError("You’re not signed in.");
      return;
    }

    setSaving(true);
    try {
      // Re-auth required by Firebase for sensitive ops
      const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);

      await updatePassword(auth.currentUser, newPassword);

      setSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");

      // optional: bounce back after a short moment
      setTimeout(() => router.push("/settings"), 600);
    } catch (e) {
      const code = e?.code || "";
      if (code.includes("wrong-password")) setError("Current password is incorrect.");
      else if (code.includes("too-many-requests")) setError("Too many attempts. Try again later.");
      else if (code.includes("requires-recent-login")) setError("Please sign out and back in, then try again.");
      else setError(e?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Change password</h1>
            <div style={sub}>Update your account password (requires your current password).</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading…" : "Security"}</div>
            {email ? <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>{email}</div> : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: UI.gap }}>
            {/* Form */}
            <div style={card}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Password</div>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                For security, you must confirm your current password before setting a new one.
              </div>

              <div style={{ height: 1, background: "#eef2f7", margin: "14px 0" }} />

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={fieldLabel}>Current password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                    <input
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      style={input}
                      placeholder="Enter current password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      style={{ ...btnBase, width: 110 }}
                      onClick={() => setShowCurrent((s) => !s)}
                    >
                      {showCurrent ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div>
                  <div style={fieldLabel}>New password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={input}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      style={{ ...btnBase, width: 110 }}
                      onClick={() => setShowNew((s) => !s)}
                    >
                      {showNew ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div style={helper}>Use at least 8 characters.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Confirm new password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      style={input}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      style={{ ...btnBase, width: 110 }}
                      onClick={() => setShowConfirm((s) => !s)}
                    >
                      {showConfirm ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              {error ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fee2e2",
                    color: "#991b1b",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #86efac",
                    background: "#d1fae5",
                    color: "#065f46",
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  {success}
                </div>
              ) : null}

              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" style={btnSoft} onClick={() => router.push("/settings")} disabled={saving}>
                  Cancel
                </button>
                <button type="button" style={btnPrimary} onClick={handleUpdate} disabled={saving}>
                  {saving ? "Updating…" : "Update password"}
                </button>
              </div>
            </div>

            {/* Side panel (style only) */}
            <div style={card}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Security notes</div>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                If you signed in a while ago, Firebase may require a fresh login before updating your password.
              </div>

              <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
                <div style={fieldLabel}>Tips</div>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: UI.text, fontSize: 13, lineHeight: 1.55 }}>
                  <li>Use a long password (12+ chars) if possible.</li>
                  <li>Avoid reusing passwords from other accounts.</li>
                  <li>If update fails, sign out and back in, then retry.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
