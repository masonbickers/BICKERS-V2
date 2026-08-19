"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { useContentLabels } from "@/app/components/ContentLabelsProvider";
import styles from "./page.module.css";

export default function LoginPage() {
  const appearance = useAppearance();
  const { label } = useContentLabels();
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAccessDenied(params.get("access") === "denied" || params.get("disabled") === "1");
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.formSide} aria-label="Sign in">
        <div className={styles.formWrapper}>
          <p className={styles.eyebrow}>Staff portal</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appearance.theme.companyLogo || "/bickers-action-logo.png"} alt={`${appearance.theme.appName} logo`} width={220} height={74} className={styles.logo} />
          <h1 className={styles.title}>{label("login.title")}</h1>
          <p className={styles.subtitle}>{label("login.subtitle")}</p>
          {accessDenied && (
            <div className={styles.error} role="alert">
              <strong>Access unavailable</strong>
              <span>Your account is disabled or is not linked to an active Bickers employee record. Contact your system administrator for help.</span>
            </div>
          )}
          <div className={styles.signInControl}>
            <SignIn
              routing="hash"
              withSignUp={false}
              forceRedirectUrl="/auth/complete"
              appearance={{
                variables: {
                  colorPrimary: "#dc2626",
                  colorBackground: "transparent",
                  colorText: "#f8fafc",
                  colorTextSecondary: "#aeb8c6",
                  colorInputBackground: "#14171c",
                  colorInputText: "#f8fafc",
                  colorNeutral: "#ffffff",
                  borderRadius: "0.625rem",
                },
                elements: {
                  rootBox: { width: "100%" },
                  cardBox: { width: "100%", boxShadow: "none" },
                  card: { width: "100%", boxShadow: "none", padding: 0, background: "transparent" },
                  header: { display: "none" },
                  footer: { display: "none" },
                  formFieldLabel: { color: "#d6dbe3", fontSize: "14px", fontWeight: 650 },
                  formFieldInput: {
                    minHeight: "42px",
                    color: "#f8fafc",
                    background: "#14171c",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    boxShadow: "none",
                  },
                  formFieldInputShowPasswordButton: { color: "#aeb8c6" },
                  socialButtonsBlockButton: {
                    minHeight: "42px",
                    background: "#ffffff",
                    border: "1px solid #d7dee8",
                    color: "#111827",
                    boxShadow: "none",
                  },
                  socialButtonsBlockButtonText: { color: "#111827", fontWeight: 700 },
                  dividerLine: { background: "rgba(255, 255, 255, 0.18)" },
                  dividerText: { color: "#8994a3" },
                  formButtonPrimary: {
                    minHeight: "42px",
                    background: "#dc2626",
                    color: "#ffffff",
                    border: "1px solid #ef4444",
                    boxShadow: "0 8px 24px rgba(220, 38, 38, 0.2)",
                    fontWeight: 750,
                  },
                  formFieldAction: { color: "#fca5a5", fontWeight: 650 },
                  alertText: { color: "#fecaca" },
                },
              }}
            />
          </div>
          <div className={styles.securityNote}>
            <span className={styles.lockIcon} aria-hidden="true">&#128274;</span>
            <span>Authorised Bickers staff only</span>
          </div>
        </div>
      </section>
      <section className={styles.imageSide} aria-label="Bickers Action production vehicle">
        <Image
          src="/login-page-photo.jpeg"
          alt="Bickers Action vehicle"
          fill
          sizes="(max-width: 760px) 0px, (max-width: 1100px) 52vw, 62vw"
          className={styles.image}
          priority
        />
        <div className={styles.imageShade} aria-hidden="true" />
        <div className={styles.imageCaption}>
          <p>Production logistics, all in one place.</p>
          <span>Bookings · Vehicles · Teams</span>
        </div>
      </section>
    </main>
  );
}
