"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  ArrowRight,
  BriefcaseBusiness,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  PencilLine,
  ShieldCheck,
  UserCog,
} from "lucide-react";

const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  successSoft: "#ecfdf5",
  successText: "#166534",
  warnSoft: "#fff7ed",
  warnText: "#9a3412",
  dangerSoft: "#fcefee",
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
const h1 = {
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};
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

const grid = (cols = 12) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const card = {
  ...surface,
  padding: 12,
  transform: "translateY(0)",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };

const sectionTitle = { fontWeight: 800, fontSize: 17, color: UI.text, marginBottom: 5 };
const sectionSub = { color: UI.muted, fontSize: 12.5, lineHeight: 1.45, marginBottom: 10 };

const fieldLabel = {
  fontSize: 11.5,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
};
const fieldValue = { fontSize: 13.5, fontWeight: 850, color: UI.text, minWidth: 0, overflowWrap: "anywhere" };

const btnBase = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.text,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
};
const btnPrimary = {
  ...btnBase,
  background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
  borderColor: UI.brand,
  color: "#fff",
};
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand };
const btnDanger = { ...btnBase, background: UI.dangerSoft, borderColor: "#e9c6c4", color: "#991b1b" };

const avatarWrap = {
  width: 50,
  height: 50,
  borderRadius: UI.radius,
  overflow: "hidden",
  border: UI.border,
  background: UI.brandSoft,
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  color: UI.text,
};

const detailCard = {
  padding: 10,
  border: UI.border,
  borderRadius: UI.radius,
  background: "#ffffff",
  minWidth: 0,
};

const iconBox = {
  width: 32,
  height: 32,
  borderRadius: UI.radius,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  flex: "0 0 auto",
};

const settingsCss = `
  @media (max-width: 1180px) {
    .settings-layout { grid-template-columns: 1fr !important; }
    .settings-main, .settings-side { grid-column: span 12 !important; }
    .settings-triple, .settings-four, .settings-two, .settings-actions { grid-template-columns: 1fr !important; }
  }
`;

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
        // eslint-disable-next-line @next/next/no-img-element
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
    return items.length ? items.join(" / ") : "Standard access";
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
      { label: "Role", value: userData?.role || "User", Icon: UserCog },
      { label: "Workspace", value: userDocData?.defaultWorkspace || "User", Icon: BriefcaseBusiness },
      { label: "Email", value: securitySummary.emailVerified ? "Verified" : "Pending", Icon: Mail },
      { label: "Authenticator", value: securitySummary.authenticator ? "Enabled" : "Not enabled", Icon: ShieldCheck },
    ],
    [securitySummary.authenticator, securitySummary.emailVerified, userData?.role, userDocData?.defaultWorkspace]
  );

  const actionCard = (href, title, subtitle, pill = "Open", Icon = ArrowRight) => (
    <Link
      href={href}
      style={{ ...card, textDecoration: "none", color: UI.text }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={iconBox}>
            <Icon size={16} />
          </span>
          <div style={{ fontWeight: 850, fontSize: 14.5 }}>{title}</div>
        </div>
        <span style={chip}>{pill}</span>
      </div>
      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{subtitle}</div>
      <div
        style={{
          marginTop: 10,
          fontWeight: 850,
          color: UI.brand,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
        }}
      >
        Open <ArrowRight size={14} />
      </div>
    </Link>
  );

  return (
    <HeaderSidebarLayout>
      <style>{settingsCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Settings</h1>
            <div style={sub}>A clean view of your account, access, and security settings.</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <div style={chip}>{loading ? "Loading..." : "Account"}</div>
            {userData?.role ? (
              <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                <UserCog size={14} />
                Role: <b style={{ marginLeft: 6 }}>{userData.role}</b>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 12, textAlign: "center", color: UI.muted }}>
            Loading settings...
          </div>
        ) : !userData ? (
          <div style={{ ...surface, padding: 12, textAlign: "center", color: UI.muted }}>
            User data not found.
          </div>
        ) : (
          <div className="settings-layout" style={grid(12)}>
            <div className="settings-main" style={{ gridColumn: "span 7" }}>
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={avatarWrap}>{avatarNode}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>{userData.name}</div>
                      <div style={{ color: UI.muted, fontSize: 13 }}>{userData.email}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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

                <div style={{ height: 1, background: "#eef2f7", margin: "12px 0" }} />

                <div className="settings-triple" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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

                <div className="settings-actions" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button type="button" style={btnSoft} onClick={() => router.push("/edit-profile")}>
                    <PencilLine size={14} />
                    Edit profile
                  </button>
                  <button type="button" style={btnPrimary} onClick={() => router.push("/change-password")}>
                    <KeyRound size={14} />
                    Change password
                  </button>
                  <button type="button" style={btnDanger} onClick={handleSignOut}>
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Account Summary</div>
                <div style={sectionSub}>A professional overview of your account, access, and protection.</div>

                <div className="settings-four" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  {summaryStats.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <div
                        key={item.label}
                        style={{ ...detailCard, display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <span style={iconBox}>
                          <Icon size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={fieldLabel}>{item.label}</div>
                          <div style={{ ...fieldValue, marginTop: 6 }}>{item.value}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Profile Details</div>
                <div style={sectionSub}>The information used to identify and contact you across the platform.</div>

                <div className="settings-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Full name</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.displayName || userData.name || "-"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Email address</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.email || "-"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Phone number</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userDocData?.phone || userData.authPhoneNumber || "-"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Sign-in method</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.providerId || "-"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Role</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userData.role || "-"}</div>
                  </div>
                  <div style={detailCard}>
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

                <div className="settings-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Workspace access</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{workspaceSummary}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Account status</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.accountStatus}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Phone verification</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.phoneVerified ? "Verified" : "Pending"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Authenticator MFA</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.authenticator ? "Enabled" : "Not enabled"}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>MFA method</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{securitySummary.mfaMethod}</div>
                  </div>
                  <div style={detailCard}>
                    <div style={fieldLabel}>Directory status</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>{userDocData ? "Profile configured" : "Basic auth profile"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-side" style={{ gridColumn: "span 5" }}>
              <div style={{ ...surface, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={sectionTitle}>Quick actions</div>
                  <span style={chip}>Account</span>
                </div>
                <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                  Common account tasks and shortcuts to the parts of the platform you use most.
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {actionCard("/edit-profile", "Edit profile", "Update your name, profile photo, and contact details", "Open", PencilLine)}
                  {actionCard("/change-password", "Change password", "Refresh your sign-in credentials and keep your account secure", "Open", KeyRound)}
                  {actionCard("/job-home", "Jobs Home", "Return to the main operational dashboard", "Open", LayoutDashboard)}
                </div>
              </div>

              <div style={{ ...card, marginTop: UI.gap }}>
                <div style={sectionTitle}>Security</div>
                <div style={sectionSub}>Your current account protection and available security actions.</div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

                  <div style={detailCard}>
                    <div style={fieldLabel}>Current security posture</div>
                    <div style={{ ...fieldValue, marginTop: 6 }}>
                      {securitySummary.authenticator && securitySummary.phoneVerified
                        ? "Strong account protection enabled"
                        : "Additional security setup recommended"}
                    </div>
                  </div>

                  <button type="button" style={btnPrimary} onClick={() => router.push("/change-password")}>
                    <KeyRound size={14} />
                    Change password
                  </button>
                  <button type="button" style={btnDanger} onClick={handleSignOut}>
                    <LogOut size={14} />
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
