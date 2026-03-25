"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  linkWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
} from "firebase/auth";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";

export default function SetupMFA() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const recaptchaRef = useRef(null);

  const routeUserToWorkspace = async (user) => {
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
  };

  const normalizePhoneNumber = (value) => {
    const raw = String(value || "").trim().replace(/\s+/g, "");
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    if (raw.startsWith("07")) return `+44${raw.slice(1)}`;
    return raw;
  };

  useEffect(() => {
    const loadPhone = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setPhoneNumber(String(snap.data()?.phone || snap.data()?.mfaPhoneNumber || ""));
      }
    };

    loadPhone().catch((err) => console.error("Failed to load MFA phone:", err));

    return () => {
      recaptchaRef.current?.clear?.();
      recaptchaRef.current = null;
    };
  }, []);

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
    } catch (err) {
      setError("Error sending SMS code: " + err.message);
    }
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
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
          mfaMethod: null,
          mfaEnabled: false,
          mfaPhoneNumber: normalizedPhone,
          mfaSecret: null,
        },
        { merge: true }
      );

      await routeUserToWorkspace(user);
    } catch (err) {
      setError("Error saving setup: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <h1 style={styles.title}>Confirm Phone Number</h1>
          <p style={styles.subtitle}>
            Confirm your phone number by SMS to finish signing in.
          </p>

          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+447..."
              style={styles.input}
            />
            <button type="button" onClick={handleSendSmsCode} style={styles.secondaryButton}>
              {smsSent ? "Resend SMS Code" : "Send SMS Code"}
            </button>
            <input
              type="text"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              placeholder="Enter SMS code"
              style={styles.input}
            />
          </div>

          <button onClick={handleConfirm} style={styles.primaryButton} disabled={saving}>
            {saving ? "Saving..." : "Confirm Setup"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
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
  error: {
    color: "#f87171",
    marginTop: "15px",
    fontSize: "14px",
  },
};
