"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";

export default function LoginPage() {
  const [accessDenied] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("access") === "denied" || params.get("disabled") === "1";
  });

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <Image
            src="/bickers-action-logo.png"
            alt="Bickers Action"
            width={330}
            height={110}
            style={styles.logo}
            priority
          />
          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>Sign in securely with your Bickers account</p>
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
                formFieldLabel: { color: "var(--legacy-color-cbd5e1)", fontSize: "14px", fontWeight: 600 },
                formFieldInput: {
                  color: "var(--color-text)",
                  background: "var(--color-info-soft)",
                  border: "1px solid var(--legacy-color-cbd5e1)",
                  boxShadow: "none",
                },
                formFieldInputShowPasswordButton: { color: "var(--color-text-subtle)" },
                socialButtonsBlockButton: {
                  background: "var(--color-white)",
                  border: "1px solid var(--legacy-color-d1d5db)",
                  color: "var(--legacy-color-111827)",
                  boxShadow: "none",
                },
                socialButtonsBlockButtonText: { color: "var(--legacy-color-111827)", fontWeight: 600 },
                dividerLine: { background: "var(--legacy-color-374151)" },
                dividerText: { color: "var(--legacy-color-9ca3af)" },
                formButtonPrimary: {
                  background: "linear-gradient(180deg, var(--legacy-color-fb5a5f) 0%, var(--legacy-color-ef4444) 100%)",
                  color: "var(--color-white)",
                  border: "none",
                  boxShadow: "none",
                  fontWeight: 700,
                },
                formFieldAction: { color: "var(--legacy-color-fb5a5f)", fontWeight: 600 },
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
  formSide: { flex: 0.7, backgroundColor: "var(--legacy-color-0d0d0d)", color: "var(--color-white)", display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" },
  formWrapper: { width: "100%", maxWidth: "380px" },
  logo: { height: "110px", width: "330px", maxWidth: "100%", objectFit: "contain", marginBottom: "24px" },
  title: { fontSize: "26px", fontWeight: "bold", margin: "0 0 8px" },
  subtitle: { fontSize: "14px", color: "var(--legacy-color-9ca3af)", margin: "0 0 24px" },
  error: { color: "var(--legacy-color-fca5a5)", background: "var(--legacy-color-450a0a)", border: "1px solid var(--color-danger-hover)", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.4 },
  imageSide: { flex: 1.3, backgroundColor: "var(--legacy-color-1a1a1a)", overflow: "hidden", position: "relative", minHeight: "100vh" },
  image: { objectFit: "cover", objectPosition: "right" },
};
