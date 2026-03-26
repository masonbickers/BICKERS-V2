"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  linkWithCredential,
  onAuthStateChanged,
  PhoneAuthProvider,
  RecaptchaVerifier,
} from "firebase/auth";
import QRCode from "qrcode";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import {
  hasAuthenticatorMfa,
  isMfaVerified,
  isPhoneVerified,
  markMfaVerified,
} from "@/app/utils/authSecurity";

export default function SetupMFA() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [userData, setUserData] = useState(null);
  const [authenticatorCode, setAuthenticatorCode] = useState("");
  const [authSecret, setAuthSecret] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const recaptchaRef = useRef(null);
  const smsCodeInputRef = useRef(null);

  const routeUserToWorkspace = useCallback(async (user) => {
    const [userSnap, employeeDoc] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      findEmployeeForUser(db, user),
    ]);

    const isAdmin = String(userSnap.data()?.role || "").toLowerCase() === "admin";
    const access = resolveEmployeeAccess(employeeDoc || {}, { isAdmin });
    const preferred =
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);
    router.push(selectLandingRoute(access, preferred));
  }, [router]);

  const normalizePhoneNumber = (value) => {
    const raw = String(value || "").trim().replace(/\s+/g, "");
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    if (raw.startsWith("07")) return `+44${raw.slice(1)}`;
    return raw;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const nextUserData = snap.data() || {};
        setUserData(nextUserData);
        setPhoneNumber(String(nextUserData?.phone || nextUserData?.mfaPhoneNumber || ""));
        if (isPhoneVerified(nextUserData) && hasAuthenticatorMfa(nextUserData)) {
          const alreadyVerified = isMfaVerified(
            typeof window !== "undefined" ? window.sessionStorage : null,
            user.uid
          );
          if (alreadyVerified) {
            await routeUserToWorkspace(user);
          } else {
            router.replace("/verify-mfa");
          }
          return;
        }
      }
    });

    return () => {
      unsubscribe();
      recaptchaRef.current?.clear?.();
      recaptchaRef.current = null;
    };
  }, [routeUserToWorkspace, router]);

  useEffect(() => {
    if (!auth.currentUser || hasAuthenticatorMfa(userData) || authSecret) return;

    const loadAuthenticatorSetup = async () => {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch("/api/mfa/setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });
        const data = await res.json();
        if (!res.ok || !data?.base32 || !data?.otpauthUrl) {
          throw new Error(data?.error || "Failed to prepare authenticator setup.");
        }
        setAuthSecret(String(data.base32));
        const nextQrCodeUrl = await QRCode.toDataURL(String(data.otpauthUrl));
        setQrCodeUrl(nextQrCodeUrl);
      } catch (err) {
        console.error("Failed to create authenticator QR code:", err);
        setError(err?.message || "Failed to prepare authenticator setup.");
      }
    };

    loadAuthenticatorSetup();
  }, [authSecret, userData]);

  const ensureRecaptcha = () => {
    if (typeof window === "undefined") return null;
    if (recaptchaRef.current) return recaptchaRef.current;

    recaptchaRef.current = new RecaptchaVerifier(auth, "setup-sms-recaptcha", {
      size: "invisible",
      callback: () => {},
    });

    return recaptchaRef.current;
  };

  const handleSendSmsCode = async () => {
    try {
      setError("");
      setInfo("");
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        setError("Enter a phone number first.");
        return;
      }

      const verifier = ensureRecaptcha();
      if (!verifier) {
        setError("SMS verification is unavailable.");
        return;
      }

      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(normalizedPhone, verifier);
      setSmsVerificationId(verificationId);
      setSmsSent(true);
      setPhoneNumber(normalizedPhone);
      setInfo("SMS code sent. Enter it below to verify your phone number.");
      setTimeout(() => smsCodeInputRef.current?.focus?.(), 0);
    } catch (err) {
      setError("Error sending SMS code: " + err.message);
    }
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const user = auth.currentUser;
      if (!user) {
        setError("No logged in user.");
        setSaving(false);
        return;
      }

      if (!smsVerificationId || !smsCode.trim()) {
        setError("Send and enter the SMS code first.");
        setSaving(false);
        return;
      }

      const credential = PhoneAuthProvider.credential(smsVerificationId, smsCode.trim());
      try {
        await linkWithCredential(user, credential);
      } catch (err) {
        if (err?.code !== "auth/provider-already-linked") {
          throw err;
        }
      }

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      await setDoc(
        doc(db, "users", user.uid),
        {
          phone: normalizedPhone,
          phoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
          mfaPhoneNumber: normalizedPhone,
        },
        { merge: true }
      );
      setUserData((prev) => ({
        ...(prev || {}),
        phone: normalizedPhone,
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
        mfaPhoneNumber: normalizedPhone,
      }));
      setInfo("Phone number verified. Finish authenticator setup below.");
    } catch (err) {
      setError("Error saving setup: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnableAuthenticator = async () => {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const user = auth.currentUser;
      if (!user) {
        setError("No logged in user.");
        return;
      }
      if (!isPhoneVerified(userData)) {
        setError("Verify your phone number first.");
        return;
      }
      if (!authSecret) {
        setError("Authenticator setup is unavailable.");
        return;
      }
      const normalizedAuthenticatorCode = authenticatorCode.replace(/\s+/g, "").trim();

      if (!normalizedAuthenticatorCode) {
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }

      const idToken = await user.getIdToken();
      const verifyRes = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          token: normalizedAuthenticatorCode,
          secret: authSecret,
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData?.error || "Invalid authenticator code. Please try again.");
        return;
      }

      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "users", user.uid),
        {
          mfaMethod: "totp",
          mfaEnabled: true,
          mfaSecret: authSecret,
          mfaEnrolledAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      setUserData((prev) => ({
        ...(prev || {}),
        mfaMethod: "totp",
        mfaEnabled: true,
        mfaSecret: authSecret,
        mfaEnrolledAt: nowIso,
      }));

      markMfaVerified(
        typeof window !== "undefined" ? window.sessionStorage : null,
        user.uid
      );
      await routeUserToWorkspace(user);
    } catch (err) {
      setError("Error enabling authenticator: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const phoneDone = isPhoneVerified(userData);
  const authenticatorDone = hasAuthenticatorMfa(userData);
  const canEditPhone = !phoneDone && !saving;

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <h1 style={styles.title}>Secure Your Account</h1>
          <p style={styles.subtitle}>
            Verify your phone number, then connect your authenticator app before entering
            the system.
          </p>

          {!phoneDone ? (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>1. Verify Phone Number</h2>
              <p style={styles.helper}>
                Send an SMS code to this number, then enter that code here to verify it.
              </p>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+447..."
                style={styles.input}
                disabled={!canEditPhone}
              />
              <button
                type="button"
                onClick={handleSendSmsCode}
                style={styles.secondaryButton}
                disabled={!canEditPhone}
              >
                {smsSent ? "Resend SMS Code" : "Send SMS Code"}
              </button>
              <input
                ref={smsCodeInputRef}
                type="text"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                placeholder="Enter SMS code"
                autoComplete="one-time-code"
                inputMode="numeric"
                style={styles.input}
                disabled={!canEditPhone}
              />
              <button
                onClick={handleConfirm}
                style={styles.primaryButton}
                disabled={saving || phoneDone}
              >
                {saving ? "Saving..." : "Confirm Phone"}
              </button>
            </div>
          ) : null}

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              {phoneDone ? "1. Enable Authenticator" : "2. Enable Authenticator"}
            </h2>
            {authenticatorDone ? (
              <p style={styles.success}>Authenticator is already enabled on this account.</p>
            ) : (
              <>
                <p style={styles.helper}>
                  Scan this QR code with Google Authenticator, Microsoft Authenticator, or 1Password.
                </p>
                {qrCodeUrl ? (
                  <Image
                    src={qrCodeUrl}
                    alt="Authenticator QR code"
                    width={180}
                    height={180}
                    style={styles.qrCode}
                  />
                ) : (
                  <p style={styles.helper}>Preparing QR code...</p>
                )}
                <input
                  type="text"
                  value={authenticatorCode}
                  onChange={(e) => setAuthenticatorCode(e.target.value)}
                  placeholder="Enter 6-digit authenticator code"
                  style={styles.input}
                  disabled={!phoneDone}
                />
                <button
                  type="button"
                  onClick={handleEnableAuthenticator}
                  style={styles.primaryButton}
                  disabled={saving || !phoneDone}
                >
                  {saving ? "Saving..." : "Enable Authenticator"}
                </button>
              </>
            )}
          </div>

          {error && <p style={styles.error}>{error}</p>}
          {info && <p style={styles.success}>{info}</p>}
        </div>
        <div id="setup-sms-recaptcha" />
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#0d0d0d",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
  },
  formSide: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  formWrapper: {
    maxWidth: "400px",
    width: "100%",
    textAlign: "center",
  },
  section: {
    display: "grid",
    gap: 12,
    marginBottom: 22,
    padding: "18px",
    border: "1px solid #262f3d",
    borderRadius: "12px",
    backgroundColor: "#101720",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    textAlign: "left",
  },
  title: {
    fontSize: "26px",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#9ca3af",
    marginBottom: "20px",
  },
  helper: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: 1.5,
    textAlign: "left",
  },
  input: {
    width: "100%",
    padding: "12px",
    border: "1px solid #333",
    borderRadius: "6px",
    fontSize: "15px",
    backgroundColor: "#111827",
    color: "#fff",
  },
  primaryButton: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#1f2937",
    color: "#fff",
    border: "1px solid #374151",
    borderRadius: "6px",
    fontSize: "15px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  qrCode: {
    width: 180,
    height: 180,
    margin: "0 auto",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
  },
  error: {
    color: "#f87171",
    marginTop: "15px",
    fontSize: "14px",
  },
  success: {
    color: "#86efac",
    marginTop: "12px",
    fontSize: "14px",
  },
};
