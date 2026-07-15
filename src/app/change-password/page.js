"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../../../firebaseConfig";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
} from "lucide-react";

/* ------------------------------- Styling tokens ------------------------------- */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid var(--legacy-color-d7dee8)",
  bg: "var(--legacy-color-f3f6f9)",
  card: "var(--legacy-color-ffffff)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  successSoft: "var(--legacy-color-ecfdf5)",
  successText: "var(--legacy-color-166534)",
  dangerSoft: "var(--legacy-color-fcefee)",
  dangerText: "var(--legacy-color-991b1b)",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, maxWidth: 760 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const card = { ...surface, padding: 12 };

const fieldLabel = {
  fontSize: 11.5,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
};
const input = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "var(--legacy-color-fff)",
  fontSize: 13.5,
  outline: "none",
  color: UI.text,
  boxSizing: "border-box",
};

const helper = { color: UI.muted, fontSize: 12, marginTop: 6 };

const btnBase = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--legacy-color-ffffff) 0%, var(--legacy-color-f8fbfe) 100%)",
  color: UI.text,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
};
const btnPrimary = {
  ...btnBase,
  background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--legacy-color-1f4b7a) 100%)",
  borderColor: UI.brand,
  color: "var(--legacy-color-fff)",
};
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand };
const iconButton = { ...btnBase, width: 38, minWidth: 38, minHeight: 36, padding: 0 };
const detailCard = { padding: 10, border: UI.border, borderRadius: UI.radius, background: "var(--legacy-color-fff)" };
const sectionTitle = { fontWeight: 800, fontSize: 17, color: UI.text, marginBottom: 5 };
const sectionSub = { color: UI.muted, fontSize: 12.5, lineHeight: 1.45, marginBottom: 10 };
const changePasswordCss = `
  @media (max-width: 1180px) {
    .change-password-layout,
    .change-password-actions { grid-template-columns: 1fr !important; }
  }
`;

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
      setError("You're not signed in.");
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
      <style>{changePasswordCss}</style>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Change password</h1>
            <div style={sub}>Update your account password (requires your current password).</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <div style={chip}>
              <ShieldCheck size={14} />
              {loading ? "Loading..." : "Security"}
            </div>
            {email ? (
              <div style={{ ...chip, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand }}>
                <Mail size={14} />
                {email}
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 12, textAlign: "center", color: UI.muted }}>Loading...</div>
        ) : (
          <div
            className="change-password-layout"
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: UI.gap }}
          >
            {/* Form */}
            <div style={card}>
              <div style={sectionTitle}>Password</div>
              <div style={sectionSub}>
                For security, you must confirm your current password before setting a new one.
              </div>

              <div style={{ height: 1, background: "var(--legacy-color-eef2f7)", margin: "12px 0" }} />

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={fieldLabel}>Current password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
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
                      style={iconButton}
                      onClick={() => setShowCurrent((s) => !s)}
                      title={showCurrent ? "Hide current password" : "Show current password"}
                      aria-label={showCurrent ? "Hide current password" : "Show current password"}
                    >
                      {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <div style={fieldLabel}>New password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
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
                      style={iconButton}
                      onClick={() => setShowNew((s) => !s)}
                      title={showNew ? "Hide new password" : "Show new password"}
                      aria-label={showNew ? "Hide new password" : "Show new password"}
                    >
                      {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div style={helper}>Use at least 8 characters.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Confirm new password</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
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
                      style={iconButton}
                      onClick={() => setShowConfirm((s) => !s)}
                      title={showConfirm ? "Hide confirmation" : "Show confirmation"}
                      aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              {error ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 10px",
                    borderRadius: UI.radius,
                    border: "1px solid var(--legacy-color-fecaca)",
                    background: UI.dangerSoft,
                    color: UI.dangerText,
                    fontWeight: 800,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={15} />
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 10px",
                    borderRadius: UI.radius,
                    border: "1px solid var(--legacy-color-86efac)",
                    background: UI.successSoft,
                    color: UI.successText,
                    fontWeight: 800,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={15} />
                  {success}
                </div>
              ) : null}

              <div className="change-password-actions" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" style={btnSoft} onClick={() => router.push("/settings")} disabled={saving}>
                  <ArrowLeft size={14} />
                  Cancel
                </button>
                <button type="button" style={btnPrimary} onClick={handleUpdate} disabled={saving}>
                  <KeyRound size={14} />
                  {saving ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>

            {/* Side panel (style only) */}
            <div style={card}>
              <div style={sectionTitle}>Security notes</div>
              <div style={sectionSub}>
                If you signed in a while ago, Firebase may require a fresh login before updating your password.
              </div>

              <div style={{ ...detailCard, marginTop: 10 }}>
                <div style={fieldLabel}>Tips</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: UI.text, fontSize: 13, lineHeight: 1.55 }}>
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
