"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";   //  QRCodeCanvas
import speakeasy from "speakeasy";
import {
  linkWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
} from "firebase/auth";

export default function SetupMFA() {
  const router = useRouter();
  const [secret, setSecret] = useState(null);
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [method, setMethod] = useState("sms");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const recaptchaRef = useRef(null);

  // Generate MFA secret when page loads
  useEffect(() => {
    const secretGen = speakeasy.generateSecret({
      name: "Bickers Booking",
    });

    setSecret(secretGen.base32);
    setOtpauthUrl(secretGen.otpauth_url);
  }, []);

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
      if (!phoneNumber.trim()) {
        setError("Enter a phone number first.");
        return;
      }

      const verifier = ensureRecaptcha();
      if (!verifier) {
        setError("SMS verification is unavailable.");
        return;
      }

      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(phoneNumber.trim(), verifier);
      setSmsVerificationId(verificationId);
      setSmsSent(true);
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

      if (method === "sms") {
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

        await setDoc(
          doc(db, "users", user.uid),
          {
            mfaMethod: "sms",
            mfaEnabled: true,
            mfaPhoneNumber: phoneNumber.trim(),
            mfaSecret: null,
          },
          { merge: true }
        );
      } else {
        await setDoc(
          doc(db, "users", user.uid),
          {
            mfaMethod: "totp",
            mfaEnabled: true,
            mfaSecret: secret,
          },
          { merge: true }
        );
      }

      router.push("/home");
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
          <h1 style={styles.title}>Set up MFA</h1>
          <p style={styles.subtitle}>
            Choose how users should verify: SMS code or authenticator app.
          </p>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setMethod("sms")}
              style={method === "sms" ? styles.activeMethodButton : styles.methodButton}
            >
              SMS
            </button>
            <button
              type="button"
              onClick={() => setMethod("totp")}
              style={method === "totp" ? styles.activeMethodButton : styles.methodButton}
            >
              Authenticator
            </button>
          </div>

          {method === "sms" ? (
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
          ) : (
            otpauthUrl && (
              <div style={{ marginBottom: 20 }}>
                <QRCodeCanvas value={otpauthUrl} size={200} />
              </div>
            )
          )}

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
  methodButton: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #374151",
    backgroundColor: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
  activeMethodButton: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #ef4444",
    backgroundColor: "#ef4444",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
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
