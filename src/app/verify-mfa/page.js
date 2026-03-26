"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  linkWithCredential,
  onAuthStateChanged,
  PhoneAuthProvider,
  RecaptchaVerifier,
} from "firebase/auth";
import Image from "next/image";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import {
  clearMfaVerified,
  hasAuthenticatorMfa,
  isPhoneVerified,
  markMfaVerified,
} from "@/app/utils/authSecurity";

export default function VerifyMfaPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [userPhoneNumber, setUserPhoneNumber] = useState("");
  const router = useRouter();
  const recaptchaRef = useRef(null);
  const smsInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const userData = snap.data() || {};
      setUserPhoneNumber(String(userData?.mfaPhoneNumber || userData?.phone || ""));
      if (!isPhoneVerified(userData) || !hasAuthenticatorMfa(userData)) {
        router.replace("/setup-mfa");
        return;
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      recaptchaRef.current?.clear?.();
      recaptchaRef.current = null;
    };
  }, [router]);

  const ensureRecaptcha = () => {
    if (typeof window === "undefined") return null;
    if (recaptchaRef.current) return recaptchaRef.current;

    recaptchaRef.current = new RecaptchaVerifier(auth, "verify-mfa-reset-recaptcha", {
      size: "invisible",
      callback: () => {},
    });

    return recaptchaRef.current;
  };

  const handleVerify = async () => {
    try {
      setError("");
      setInfo("");
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please login again.");
        router.push("/login");
        return;
      }

      //  Load secret key from Firestore
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        setError("No MFA setup found.");
        return;
      }

      const userData = snap.data() || {};
      if (!isPhoneVerified(userData) || !hasAuthenticatorMfa(userData)) {
        router.replace("/setup-mfa");
        return;
      }

      const normalizedCode = code.replace(/\s+/g, "").trim();
      if (!normalizedCode) {
        setError("Enter the 6-digit authenticator code.");
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
          token: normalizedCode,
        }),
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.ok) {
        const [userSnap, employeeDoc] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          findEmployeeForUser(db, user),
        ]);
        const isAdmin = String(userSnap.data()?.role || "").toLowerCase() === "admin";
        const access = resolveEmployeeAccess(employeeDoc || {}, { isAdmin });
        const preferred =
          getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
          getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);
        markMfaVerified(
          typeof window !== "undefined" ? window.sessionStorage : null,
          user.uid
        );
        router.push(selectLandingRoute(access, preferred));
      } else {
        setError(verifyData?.error || "Invalid code, try again.");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendResetSms = async () => {
    try {
      setError("");
      setInfo("");
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please login again.");
        return;
      }
      if (!userPhoneNumber) {
        setError("No verified phone number is available for this account.");
        return;
      }

      const verifier = ensureRecaptcha();
      if (!verifier) {
        setError("SMS recovery is unavailable.");
        return;
      }

      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(userPhoneNumber, verifier);
      setSmsVerificationId(verificationId);
      setSmsSent(true);
      setInfo(`SMS code sent to ${userPhoneNumber}. Enter it below to reset authenticator MFA.`);
      setTimeout(() => smsInputRef.current?.focus?.(), 0);
    } catch (err) {
      setError(err?.message || "Unable to send SMS reset code.");
    }
  };

  const handleResetWithSms = async () => {
    try {
      setResetting(true);
      setError("");
      setInfo("");
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please login again.");
        return;
      }
      if (!smsVerificationId || !smsCode.replace(/\s+/g, "").trim()) {
        setError("Send and enter the SMS code first.");
        return;
      }

      const credential = PhoneAuthProvider.credential(
        smsVerificationId,
        smsCode.replace(/\s+/g, "").trim()
      );

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
          mfaMethod: null,
          mfaEnabled: false,
          mfaSecret: null,
          mfaEnrolledAt: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      clearMfaVerified(
        typeof window !== "undefined" ? window.sessionStorage : null,
        user.uid
      );
      setInfo("Authenticator reset. Please set it up again.");
      router.replace("/setup-mfa");
    } catch (err) {
      setError(err?.message || "Unable to reset authenticator via SMS.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.formWrapper}>
          <p style={styles.subtitle}>Loading security check...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.formWrapper}>
        <Image
          src="/bickers-action-logo.png"
          alt="Bickers Logo"
          width={330}
          height={110}
          style={{ marginBottom: "20px" }}
        />
        <h2 style={styles.title}>Enter Authenticator Code</h2>
        <p style={styles.subtitle}>
          Open your Google Authenticator app and enter the 6-digit code
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          style={styles.input}
        />
        <button onClick={handleVerify} style={styles.button}>
          Verify Code
        </button>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={styles.secondaryButton}
        >
          Back to login
        </button>
        <button
          type="button"
          onClick={() => {
            setResetOpen((prev) => !prev);
            setError("");
            setInfo("");
          }}
          style={styles.tertiaryButton}
        >
          {resetOpen ? "Hide SMS reset" : "Reset MFA via SMS"}
        </button>
        {resetOpen ? (
          <div style={styles.resetPanel}>
            <div style={styles.resetTitle}>SMS Recovery</div>
            <div style={styles.resetText}>
              We will send a code to your verified phone number and clear the current
              authenticator setup so you can enroll it again.
            </div>
            <div style={styles.resetPhone}>{userPhoneNumber || "No verified phone number saved"}</div>
            <button
              type="button"
              onClick={handleSendResetSms}
              style={styles.secondaryButton}
              disabled={resetting || !userPhoneNumber}
            >
              {smsSent ? "Resend SMS code" : "Send SMS code"}
            </button>
            <input
              ref={smsInputRef}
              type="text"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              placeholder="Enter SMS code"
              autoComplete="one-time-code"
              inputMode="numeric"
              style={styles.input}
              disabled={resetting || !smsSent}
            />
            <button
              type="button"
              onClick={handleResetWithSms}
              style={styles.button}
              disabled={resetting || !smsSent}
            >
              {resetting ? "Resetting..." : "Reset authenticator"}
            </button>
          </div>
        ) : null}
        {info && <p style={styles.info}>{info}</p>}
        {error && <p style={styles.error}>{error}</p>}
      </div>
      <div id="verify-mfa-reset-recaptcha" />
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
  },
  formWrapper: {
    backgroundColor: "#111",
    padding: "30px",
    borderRadius: "8px",
    textAlign: "center",
    color: "#fff",
    width: "100%",
    maxWidth: "400px",
  },
  title: { fontSize: "20px", fontWeight: "bold", marginBottom: "10px" },
  subtitle: { fontSize: "14px", marginBottom: "20px", color: "#aaa" },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "16px",
    border: "1px solid #333",
    borderRadius: "6px",
    fontSize: "15px",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    textAlign: "center",
  },
  button: {
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
    marginTop: "10px",
  },
  tertiaryButton: {
    width: "100%",
    padding: "12px",
    backgroundColor: "transparent",
    color: "#cbd5e1",
    border: "1px solid #334155",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "10px",
  },
  resetPanel: {
    marginTop: "14px",
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    textAlign: "left",
  },
  resetTitle: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#fff",
    marginBottom: "6px",
  },
  resetText: {
    fontSize: "12px",
    color: "#94a3b8",
    lineHeight: 1.5,
    marginBottom: "10px",
  },
  resetPhone: {
    fontSize: "13px",
    color: "#e2e8f0",
    marginBottom: "10px",
    fontWeight: "bold",
  },
  info: { color: "#86efac", marginTop: "10px" },
  error: { color: "#f87171", marginTop: "10px" },
};
