"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { useContentLabels } from "@/app/components/ContentLabelsProvider";

export default function LoginPage() {
  const appearance = useAppearance();
  const { label } = useContentLabels();
  const [accessDenied] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("access") === "denied" || params.get("disabled") === "1";
  });

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appearance.theme.companyLogo || "/bickers-action-logo.png"} alt={`${appearance.theme.appName} logo`} width={330} height={110} style={styles.logo} />
          <h1 style={styles.title}>{label("login.title")}</h1>
          <p style={styles.subtitle}>{label("login.subtitle")}</p>
          {accessDenied && (
            <p style={styles.error}>
              This Clerk account is disabled or is not linked to an active Bickers employee record.
            </p>
          )}
          <SignIn
            routing="hash"
            withSignUp={false}
            forceRedirectUrl="/auth/complete"
            appearance={{
              variables: {
                colorPrimary: "var(--color-danger)",
                colorBackground: "var(--shell-topbar-bg)",
                colorText: "var(--shell-text)",
                colorTextSecondary: "var(--shell-muted)",
                colorInputBackground: "var(--color-info-soft)",
                colorInputText: "var(--color-text)",
                colorNeutral: "var(--color-surface)",
                borderRadius: "0.5rem",
              },
              elements: {
                rootBox: { width: "100%" },
                cardBox: { width: "100%", boxShadow: "none" },
                card: { width: "100%", boxShadow: "none", padding: 0, background: "transparent" },
                header: { display: "none" },
                footer: { display: "none" },
                formFieldLabel: { color: "var(--color-border-strong)", fontSize: "14px", fontWeight: 600 },
                formFieldInput: {
                  color: "var(--color-text)",
                  background: "var(--color-info-soft)",
                  border: "1px solid var(--color-border-strong)",
                  boxShadow: "none",
                },
                formFieldInputShowPasswordButton: { color: "var(--color-text-subtle)" },
                socialButtonsBlockButton: {
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  boxShadow: "none",
                },
                socialButtonsBlockButtonText: { color: "var(--color-text)", fontWeight: 600 },
                dividerLine: { background: "var(--color-text-muted)" },
                dividerText: { color: "var(--color-text-muted)" },
                formButtonPrimary: {
                  background: "linear-gradient(180deg, var(--color-accent) 0%, var(--color-danger) 100%)",
                  color: "var(--color-white)",
                  border: "none",
                  boxShadow: "none",
                  fontWeight: 700,
                },
                formFieldAction: { color: "var(--color-accent)", fontWeight: 600 },
                alertText: { color: "var(--color-danger-border)" },
              },
            }}
          />
        </div>
      </div>
      <div style={styles.imageSide}>
        <Image
          src="/login-page-photo.jpeg"
          alt="Bickers Action vehicle"
          fill
          sizes="65vw"
          style={styles.image}
          priority
        />
      </div>
    </div>
  );
}

const styles = {
  page: { display: "flex", minHeight: "100vh", backgroundColor: "var(--shell-topbar-bg)", fontFamily: "var(--font-sans)" },
  formSide: { flex: 0.7, backgroundColor: "var(--shell-sidebar-bg)", color: "var(--color-white)", display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" },
  formWrapper: { width: "100%", maxWidth: "380px" },
  logo: { height: "110px", width: "330px", maxWidth: "100%", objectFit: "contain", marginBottom: "24px" },
  title: { fontSize: "26px", fontWeight: "bold", margin: "0 0 8px" },
  subtitle: { fontSize: "14px", color: "var(--color-text-muted)", margin: "0 0 24px" },
  error: { color: "var(--color-danger-border)", background: "var(--color-danger-hover)", border: "1px solid var(--color-danger-hover)", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.4 },
  imageSide: { flex: 1.3, backgroundColor: "var(--shell-sidebar-bg)", overflow: "hidden", position: "relative", minHeight: "100vh" },
  image: { objectFit: "cover", objectPosition: "right" },
};
