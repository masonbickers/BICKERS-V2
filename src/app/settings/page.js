"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

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
  successSoft: "#ecfdf5",
  successText: "#166534",
  warnSoft: "#fff7ed",
  warnText: "#9a3412",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};
const h1 = {
  color: UI.text,
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  margin: 0,
};
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

const grid = (cols = 12) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const card = {
  ...surface,
  padding: 16,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

const sectionTitle = { fontWeight: 900, fontSize: 16, color: UI.text, marginBottom: 8 };
const sectionSub = { color: UI.muted, fontSize: 12, marginBottom: 12 };

const fieldLabel = {
  fontSize: 12,
  fontWeight: 800,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
};
const fieldValue = { fontSize: 14, fontWeight: 900, color: UI.text };

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
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};
const btnPrimary = { ...btnBase, background: UI.brand, borderColor: UI.brand, color: "#fff" };
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand };
const btnDanger = { ...btnBase, background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b" };

const avatarWrap = {
  width: 52,
  height: 52,
  borderRadius: 999,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  color: UI.text,
};

function initials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function statusPill(label, ok) {
  return {
    label,
    style: {
      ...chip,
      background: ok ? UI.successSoft : UI.warnSoft,
      borderColor: ok ? "#bbf7d0" : "#fed7aa",
      color: ok ? UI.successText : UI.warnText,
    },
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [userDocData, setUserDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const data = docSnap.exists() ? docSnap.data() || {} : {};

        setUserDocData(docSnap.exists() ? data : null);
        setUserData({
          name: data.name || user.displayName || "No name",
          email: user.email || "No email",
          role: data.role || "No role",
          photoURL: data.photoURL || user.photoURL || null,
          uid: user.uid,
          emailVerified: !!user.emailVerified,
          displayName: user.displayName || data.name || "",
          authPhoneNumber: user.phoneNumber || "",
          providerId:
            Array.isArray(user.providerData) && user.providerData.length
              ? user.providerData.map((p) => p.providerId).filter(Boolean).join(", ")
              : "password",
        });
      } catch {
        setUserDocData(null);
        setUserData({
          name: user.displayName || "No name",
          email: user.email || "No email",
          role: "No role",
          photoURL: user.photoURL || null,
          uid: user.uid,
          emailVerified: !!user.emailVerified,
          displayName: user.displayName || "",
          authPhoneNumber: user.phoneNumber || "",
          providerId:
            Array.isArray(user.providerData) && user.providerData.length
              ? user.providerData.map((p) => p.providerId).filter(Boolean).join(", ")
              : "password",
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const avatarNode = useMemo(() => {
    if (!userData) return null;
    if (userData.photoURL) {
      return (
        <img
          src={userData.photoURL}
          alt="Profile"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      );
    }
    return <span>{initials(userData.name)}</span>;
  }, [userData]);

  const workspaceSummary = useMemo(() => {
    const appAccess =
      userDocData?.appAccess && typeof userDocData.appAccess === "object"
        ? userDocData.appAccess
        : {};
    const items = [];
    if (appAccess.user) items.push("User workspace");
    if (appAccess.service) items.push("Service workspace");
    if (!items.length && userDocData?.defaultWorkspace) {
      items.push(`${String(userDocData.defaultWorkspace)} workspace`);
    }
    return items.length ? items.join(" • ") : "Standard access";
  }, [userDocData]);

  const securitySummary = useMemo(
    () => ({
      accountStatus: userDocData?.isEnabled === false ? "Disabled" : "Active",
      emailVerified: userData?.emailVerified === true,
      phoneVerified: userDocData?.phoneVerified === true,
      authenticator: userDocData?.mfaEnabled === true,
      mfaMethod: userDocData?.mfaMethod || "Not configured",
    }),
    [userData?.emailVerified, userDocData]
  );

  const summaryStats = useMemo(
    () => [
      { label: "Role", value: userData?.role || "User" },
      { label: "Workspace", value: userDocData?.defaultWorkspace || "User" },
      { label: "Email", value: securitySummary.emailVerified ? "Verified" : "Pending" },
      { label: "Authenticator", value: securitySummary.authenticator ? "Enabled" : "Not enabled" },
    ],
    [securitySummary.authenticator, securitySummary.emailVerified, userData?.role, userDocData?.defaultWorkspace]
  );

  const actionCard = (href, title, subtitle, pill = "Open →") => (
    <Link
      href={href}
      style={{ ...card, textDecoration: "none", color: UI.text }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <span style={chip}>{pill}</span>
      </div>
      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{subtitle}</div>
      <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
    </Link>
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Settings</h1>
            <div style={sub}>A clean view of your account, access, and security settings.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading..." : "Account"}</div>
            {userData?.role ? (
              <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                Role: <b style={{ marginLeft: 6 }}>{userData.role}</b>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>
            Loading settings...
          </div>
        ) : !userData ? (
          <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>
            User data not found.
          </div>
        ) : (
          <div style={grid(12)}>
            <div style={{ gridColumn: "span 7" }}>
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={avatarWrap}>{avatarNode}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>{userData.name}</div>
                      <div style={{ color: UI.muted, fontSize: 13 }}>{userData.email}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={chip}>{userData.role}</span>
                    <span
                      style={{
                        ...chip,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                      }}
                    >
                      {String(userData.uid || "").slice(0, 8)}...
                    </span>
                  </div>
                </div>

                <div style={{ height: 1, background: "#eef2f7", margin: "14px 0" }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={fieldLabel}>Name</div>
                    <div style={fieldValue}>{userData.name || "-"}</div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Email</div>
                    <div style={fieldValue}>{userData.email || "-"}</div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Role</div>
                    <div style={fieldValue}>{userData.role || "-"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <button type="button" style={btnSoft} onClick={() => router.push("/edit-profile")}>
                    Edit profile
                  </button>
                  <button type="button" style={btnBase} onClick={() => router.push("/change-password")}>
                    Change password
                  </button>
                  <button type="button" style={btnDanger} onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Account Summary</div>
                <div style={sectionSub}>A professional overview of your account, access, and protection.</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                  {summaryStats.map((item) => (
                    <div
                      key={item.label}
                      style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}
                    >
                      <div style={fieldLabel}>{item.label}</div>
                      <div style={{ ...fieldValue, marginTop: 8 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Profile Details</div>
                <div style={sectionSub}>The information used to identify and contact you across the platform.</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Full name</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.displayName || userData.name || "-"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Email address</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.email || "-"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Phone number</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userDocData?.phone || userData.authPhoneNumber || "-"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Sign-in method</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.providerId || "-"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Role</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.role || "-"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Account reference</div>
                    <div
                      style={{
                        ...fieldValue,
                        marginTop: 6,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {userData.uid || "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Access Overview</div>
                <div style={sectionSub}>A concise view of how this account is configured inside the system.</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Workspace access</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{workspaceSummary}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Account status</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.accountStatus}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Phone verification</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.phoneVerified ? "Verified" : "Pending"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Authenticator MFA</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.authenticator ? "Enabled" : "Not enabled"}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>MFA method</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.mfaMethod}</div>
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Directory status</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userDocData ? "Profile configured" : "Basic auth profile"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "span 5" }}>
              <div style={{ ...surface, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Quick actions</div>
                  <span style={chip}>Account</span>
                </div>
                <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                  Common account tasks and shortcuts to the parts of the platform you use most.
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {actionCard("/edit-profile", "Edit profile", "Update your name, profile photo, and contact details")}
                  {actionCard("/change-password", "Change password", "Refresh your sign-in credentials and keep your account secure")}
                  {actionCard("/job-home", "Jobs Home", "Return to the main operational dashboard", "Open")}
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Security</div>
                <div style={sectionSub}>Your current account protection and available security actions.</div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={statusPill("Email verified", securitySummary.emailVerified).style}>
                      Email {securitySummary.emailVerified ? "verified" : "pending"}
                    </span>
                    <span style={statusPill("Phone verified", securitySummary.phoneVerified).style}>
                      Phone {securitySummary.phoneVerified ? "verified" : "pending"}
                    </span>
                    <span style={statusPill("Authenticator", securitySummary.authenticator).style}>
                      Authenticator {securitySummary.authenticator ? "enabled" : "not enabled"}
                    </span>
                  </div>

                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
                    <div style={fieldLabel}>Current security posture</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>
                      {securitySummary.authenticator && securitySummary.phoneVerified
                        ? "Strong account protection enabled"
                        : "Additional security setup recommended"}
                    </div>
                  </div>

                  <button type="button" style={btnBase} onClick={() => router.push("/change-password")}>
                    Change password
                  </button>
                  <button type="button" style={btnDanger} onClick={handleSignOut}>
                    Sign out of this device
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
