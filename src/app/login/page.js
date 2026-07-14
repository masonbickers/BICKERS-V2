"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";

export default function LoginPage() {
  const [accessState] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "required") return "reset";
    if (params.get("access") === "denied" || params.get("disabled") === "1") return "denied";
    return "";
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
          {accessState === "denied" && (
            <p style={styles.error}>
              This Clerk account is disabled or is not linked to an active Bickers employee record.
            </p>
          )}
          {accessState === "reset" && (
            <p style={styles.error}>
              Your previous password may have been exposed. Use Clerk&apos;s “Forgot password?” flow below to set a new password. Access remains blocked until the verified update completes.
            </p>
          )}
          <SignIn
            routing="hash"
            withSignUp={false}
            forceRedirectUrl="/auth/complete"
            appearance={{
              variables: {
                colorPrimary: "#ef4444",
                colorBackground: "#0d0d0d",
                colorText: "#ffffff",
                colorTextSecondary: "#9ca3af",
                colorInputBackground: "#eff6ff",
                colorInputText: "#0f172a",
                colorNeutral: "#ffffff",
                borderRadius: "0.5rem",
              },
              elements: {
                rootBox: { width: "100%" },
                cardBox: { width: "100%", boxShadow: "none" },
                card: { width: "100%", boxShadow: "none", padding: 0, background: "transparent" },
                header: { display: "none" },
                footer: { display: "none" },
                formFieldLabel: { color: "#cbd5e1", fontSize: "14px", fontWeight: 600 },
                formFieldInput: {
                  color: "#0f172a",
                  background: "#eff6ff",
                  border: "1px solid #cbd5e1",
                  boxShadow: "none",
                },
                formFieldInputShowPasswordButton: { color: "#64748b" },
                socialButtonsBlockButton: {
                  background: "#ffffff",
                  border: "1px solid #d1d5db",
                  color: "#111827",
                  boxShadow: "none",
                },
                socialButtonsBlockButtonText: { color: "#111827", fontWeight: 600 },
                dividerLine: { background: "#374151" },
                dividerText: { color: "#9ca3af" },
                formButtonPrimary: {
                  background: "linear-gradient(180deg, #fb5a5f 0%, #ef4444 100%)",
                  color: "#ffffff",
                  border: "none",
                  boxShadow: "none",
                  fontWeight: 700,
                },
                formFieldAction: { color: "#fb5a5f", fontWeight: 600 },
                alertText: { color: "#fecaca" },
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
  page: { display: "flex", minHeight: "100vh", backgroundColor: "#0d0d0d", fontFamily: "Arial, sans-serif" },
  formSide: { flex: 0.7, backgroundColor: "#0d0d0d", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", padding: "2rem" },
  formWrapper: { width: "100%", maxWidth: "380px" },
  logo: { height: "110px", width: "330px", maxWidth: "100%", objectFit: "contain", marginBottom: "24px" },
  title: { fontSize: "26px", fontWeight: "bold", margin: "0 0 8px" },
  subtitle: { fontSize: "14px", color: "#9ca3af", margin: "0 0 24px" },
  error: { color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.4 },
  imageSide: { flex: 1.3, backgroundColor: "#1a1a1a", overflow: "hidden", position: "relative", minHeight: "100vh" },
  image: { objectFit: "cover", objectPosition: "right" },
};
