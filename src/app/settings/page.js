"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrainCircuit, KeyRound, LogOut, Monitor, Moon, PencilLine, Sun } from "lucide-react";
import { auth, db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { INTERFACE_SCALE_OPTIONS } from "@/app/utils/interfaceScale";
import { CARD_STYLE_OPTIONS } from "@/app/utils/cardStyle";

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[0][0] || ""}${parts.length > 1 ? parts.at(-1)[0] : ""}`.toUpperCase() : "?";
}

export default function SettingsPage() {
  const router = useRouter();
  const appearance = useAppearance();
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
        const snapshot = await getDoc(doc(db, "users", user.uid));
        const data = snapshot.exists() ? snapshot.data() || {} : {};
        setUserDocData(snapshot.exists() ? data : null);
        setUserData({
          name: data.name || user.displayName || "No name",
          email: user.email || "No email",
          role: data.role || "User",
          photoURL: data.photoURL || user.photoURL || null,
          uid: user.uid,
          emailVerified: Boolean(user.emailVerified),
          phone: data.phone || user.phoneNumber || "Not provided",
        });
      } catch {
        setUserDocData(null);
        setUserData({
          name: user.displayName || "No name",
          email: user.email || "No email",
          role: "User",
          photoURL: user.photoURL || null,
          uid: user.uid,
          emailVerified: Boolean(user.emailVerified),
          phone: user.phoneNumber || "Not provided",
        });
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const workspaceSummary = useMemo(() => {
    const access = userDocData?.appAccess && typeof userDocData.appAccess === "object" ? userDocData.appAccess : {};
    const workspaces = [];
    if (access.user) workspaces.push("User workspace");
    if (access.service) workspaces.push("Service workspace");
    if (!workspaces.length && userDocData?.defaultWorkspace) workspaces.push(`${userDocData.defaultWorkspace} workspace`);
    return workspaces.length ? workspaces.join(" / ") : "Standard access";
  }, [userDocData]);

  const canManageAiRules = useMemo(() => {
    const role = String(userData?.role || "").trim().toLowerCase().replaceAll(" ", "");
    return ["admin", "platformadmin", "superadmin"].includes(role);
  }, [userData?.role]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <HeaderSidebarLayout>
      <div data-sidebar-page className={layoutStyles.page}>
        <header data-sidebar-page-header className={layoutStyles.pageHeader}>
          <h1>Settings</h1>
          <p>Manage your profile, appearance, and account security.</p>
        </header>

        {loading ? (
          <div className={layoutStyles.stateCard}>Loading settings...</div>
        ) : !userData ? (
          <div className={layoutStyles.stateCard}>User data not found.</div>
        ) : (
          <div className={layoutStyles.settingsGrid}>
            <section className={`${layoutStyles.card} ${layoutStyles.profileCard}`}>
              <div className={layoutStyles.profileIdentity}>
                <div className={layoutStyles.avatar}>
                  {userData.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userData.photoURL} alt="" />
                  ) : <span>{initials(userData.name)}</span>}
                </div>
                <div className={layoutStyles.profileCopy}>
                  <h2>{userData.name}</h2>
                  <p>{userData.email}</p>
                  <p>{userData.phone}</p>
                </div>
              </div>
              <button className={layoutStyles.secondaryButton} type="button" onClick={() => router.push("/edit-profile")}>
                <PencilLine size={16} /> Edit profile
              </button>
            </section>

            <section className={layoutStyles.card}>
              <div className={layoutStyles.sectionHeading}>
                <h2>Appearance</h2>
                <p>Choose how the app looks and how much fits on screen.</p>
              </div>
              <div className={layoutStyles.controlLabel}>Theme</div>
              <div className={layoutStyles.themeOptions} role="group" aria-label="Theme">
                {[["dark", "Dark", Moon], ["normal", "Normal", Monitor], ["light", "Light", Sun]].map(([value, label, Icon]) => (
                  <button key={value} type="button" onClick={() => appearance.setModePreference(value)} disabled={value === "dark" && appearance.theme?.darkModeEnabled === false} className={layoutStyles.optionButton} data-selected={appearance.modePreference === value} aria-pressed={appearance.modePreference === value}>
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
              <div className={layoutStyles.controlLabel}>Interface size</div>
              <div className={layoutStyles.interfaceScaleOptions} role="group" aria-label="Interface size">
                {INTERFACE_SCALE_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => appearance.setInterfaceScale(option.value)} aria-pressed={appearance.interfaceScale === option.value} className={layoutStyles.interfaceScaleButton} data-selected={appearance.interfaceScale === option.value}>
                    <span className={layoutStyles.interfaceScaleLabel}>{option.label} <strong>{option.percent}%</strong></span>
                    <span className={layoutStyles.interfaceScaleDescription}>{option.description}</span>
                  </button>
                ))}
              </div>
              <div className={layoutStyles.controlLabel}>Card layout</div>
              <div className={layoutStyles.cardStyleOptions} role="group" aria-label="Card layout">
                {CARD_STYLE_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => appearance.setCardStyle(option.value)} aria-pressed={appearance.cardStyle === option.value} className={layoutStyles.interfaceScaleButton} data-selected={appearance.cardStyle === option.value}>
                    <span className={layoutStyles.interfaceScaleLabel}>{option.label}</span>
                    <span className={layoutStyles.interfaceScaleDescription}>{option.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className={layoutStyles.card}>
              <div className={layoutStyles.sectionHeading}>
                <h2>Security</h2>
                <p>Manage your password and signed-in session.</p>
              </div>
              <div className={layoutStyles.verificationRow}>
                <span className={layoutStyles.verificationDot} data-verified={userData.emailVerified} />
                <div><strong>Email {userData.emailVerified ? "verified" : "not verified"}</strong><span>{userData.email}</span></div>
              </div>
              <div className={layoutStyles.securityActions}>
                <button className={layoutStyles.primaryButton} type="button" onClick={() => router.push("/change-password")}><KeyRound size={16} /> Change password</button>
                <button className={layoutStyles.dangerButton} type="button" onClick={handleSignOut}><LogOut size={16} /> Sign out</button>
              </div>
            </section>

            {canManageAiRules ? (
              <details className={`${layoutStyles.card} ${layoutStyles.adminDetails}`}>
                <summary>Admin &amp; account details</summary>
                <p className={layoutStyles.adminIntro}>Technical access information is kept here so it does not distract from everyday settings.</p>
                <div className={layoutStyles.adminGrid}>
                  <div><span>Role</span><strong>{userData.role}</strong></div>
                  <div><span>Workspace access</span><strong>{workspaceSummary}</strong></div>
                  <div><span>Account status</span><strong>{userDocData?.isEnabled === false ? "Disabled" : "Active"}</strong></div>
                  <div><span>Account reference</span><strong className={layoutStyles.mono}>{userData.uid}</strong></div>
                </div>
                <Link className={layoutStyles.adminLink} href="/settings/ai-business-rules"><BrainCircuit size={16} /> AI Business Rules</Link>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
