"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  signInWithCustomToken,
  setPersistence,
} from "firebase/auth";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import Image from "next/image";
import {
  clearMfaVerified,
  hasAuthenticatorMfa,
  isMfaVerified,
  isPhoneVerified,
  markMfaVerified,
} from "@/app/utils/authSecurity";
import { sendLoginNotification } from "@/app/utils/loginNotification";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [disabledRedirect] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("disabled") === "1";
  });

  const upsertUserDoc = async (user, { name: fullName = "", phone: phoneNumber = "" } = {}) => {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    const baseIfNew = snap.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          isEnabled: true,
          role: "user",
          isService: false,
          appAccess: { user: true, service: false },
          defaultWorkspace: "user",
          phoneVerified: false,
        };

    await setDoc(
      ref,
      {
        ...baseIfNew,
        uid: user.uid,
        email: (user.email || "").toLowerCase(),
        name: snap.exists() ? (snap.data()?.name || fullName || "") : (fullName || ""),
        phone: snap.exists() ? (snap.data()?.phone || phoneNumber || "") : (phoneNumber || ""),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return ref;
  };

  const refreshServerAccess = async (user) => {
    if (!user?.getIdToken) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/security/bootstrap-access", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("[login] account access refresh skipped:", data?.error || res.status);
      }
    } catch (err) {
      console.warn("[login] account access refresh skipped:", err);
    }
  };

  const signInWithUserCode = async (cleanEmail, userCode) => {
    const res = await fetch("/api/auth/user-code-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, userCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || "Invalid email or user code.");
      err.status = res.status;
      throw err;
    }
    return signInWithCustomToken(auth, data.customToken);
  };

  //  Handle Login / Signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const cleanEmail = (email || "").trim().toLowerCase();

      // Alert Restrict to company emails only
      if (!cleanEmail.endsWith("@bickers.co.uk")) {
        setError("Only @bickers.co.uk emails are allowed.");
        return;
      }

      await setPersistence(
        auth,
        rememberDevice ? browserLocalPersistence : browserSessionPersistence
      );

      let cred;
      let loginMethod = "user-code";
      let userCodeError = null;

      try {
        cred = await signInWithUserCode(cleanEmail, password);
      } catch (err) {
        userCodeError = err;
        loginMethod = "password";
        try {
          cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        } catch (passwordErr) {
          if (userCodeError?.status >= 500) throw userCodeError;
          throw passwordErr;
        }
      }

      const user = cred.user;

      if (loginMethod === "password" && !user.emailVerified) {
        setError("Please verify your email before logging in.");
        return;
      }

      const userRef =
        loginMethod === "user-code"
          ? doc(db, "users", user.uid)
          : await upsertUserDoc(user);

      const existingSnap = await getDoc(userRef);
      if (existingSnap.exists() && existingSnap.data()?.isEnabled === false) {
        await signOut(auth);
        setError("This account has been disabled. Contact an administrator.");
        return;
      }

      await refreshServerAccess(user);

      const snap = await getDoc(userRef);
      const userData = snap.data() || {};
      clearMfaVerified(typeof window !== "undefined" ? window.sessionStorage : null, user.uid);

      if (!isPhoneVerified(userData)) {
        router.push("/setup-mfa");
        return;
      }

      if (!hasAuthenticatorMfa(userData)) {
        router.push("/setup-mfa");
        return;
      }

      const trustedDeviceVerified = isMfaVerified(
        typeof window !== "undefined" ? window.localStorage : null,
        user.uid
      );
      if (trustedDeviceVerified) {
        await sendLoginNotification(user, loginMethod === "user-code" ? "user-code" : "trusted-device");
        router.push("/dashboard");
        return;
      }

      router.push("/verify-mfa");
    } catch (err) {
      if (err?.code === "permission-denied" || String(err?.message || "").includes("permission")) {
        setError("This account is disabled or does not have access.");
        try {
          await signOut(auth);
        } catch {}
        return;
      }
      if (String(err?.code || "").includes("invalid-credential")) {
        setError("Login failed. Check the email and user code.");
        return;
      }
      setError(err?.message || "Login error");
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address first.");
      return;
    }

    if (!cleanEmail.endsWith("@bickers.co.uk")) {
      setError("Only @bickers.co.uk emails are allowed.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setMessage(`Password reset email sent to ${cleanEmail}.`);
    } catch (err) {
      setError(err?.message || "Failed to send password reset email.");
    }
  };

  const handlePasskeyLogin = async () => {
    setError("");
    setMessage("");

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address first.");
      return;
    }

    if (!cleanEmail.endsWith("@bickers.co.uk")) {
      setError("Only @bickers.co.uk emails are allowed.");
      return;
    }

    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support passkeys.");
      return;
    }

    setPasskeyLoading(true);
    try {
      await setPersistence(
        auth,
        rememberDevice ? browserLocalPersistence : browserSessionPersistence
      );

      const optionsRes = await fetch("/api/passkeys/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData?.error || "Could not start passkey login.");

      const credential = await startAuthentication({ optionsJSON: optionsData.options });
      const verifyRes = await fetch("/api/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, credential }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData?.error || "Passkey login failed.");

      const cred = await signInWithCustomToken(auth, verifyData.customToken);
      await refreshServerAccess(cred.user);
      const storage = rememberDevice
        ? typeof window !== "undefined" ? window.localStorage : null
        : typeof window !== "undefined" ? window.sessionStorage : null;
      markMfaVerified(storage, cred.user.uid, rememberDevice ? { daysValid: 30 } : {});
      await sendLoginNotification(cred.user, "passkey");
      router.push("/dashboard");
    } catch (err) {
      setError(err?.message || "Passkey login failed.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <Image
            src="/bickers-action-logo.png"
            alt="Bickers Logo"
            width={330}
            height={110}
            style={styles.logo}
          />

          <>
              <h1 style={styles.title}>Welcome back</h1>
              <p style={styles.subtitle}>Enter your email and user code</p>

              <form onSubmit={handleSubmit}>
                <label style={styles.label}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={styles.input}
                />

                <label style={styles.label}>User code</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={styles.input}
                />

                <div style={styles.formFooter}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      style={styles.checkbox}
                    />
                    Remember for 30 days
                  </label>
                  <a href="#" onClick={handleForgotPassword} style={styles.link}>
                    Forgot password
                  </a>
                </div>

                <button type="submit" style={styles.primaryButton}>
                  Sign in
                </button>

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                >
                  {passkeyLoading ? "Checking passkey..." : "Sign in with passkey"}
                </button>

                {(error || disabledRedirect) && (
                  <p style={styles.error}>
                    {error || "This account has been disabled. Contact an administrator."}
                  </p>
                )}
                {message && <p style={styles.success}>{message}</p>}
              </form>
          </>
        </div>
      </div>

      <div style={styles.imageSide}>
        <Image
          src="/login-page-photo.jpeg"
          alt="Illustration"
          fill
          style={styles.image}
        />
      </div>
    </div>
  );
}

//  Styles unchanged
const styles = {
  page: { display: "flex", height: "100vh", backgroundColor: "#0d0d0d", fontFamily: "Arial, sans-serif" },
  formSide: { flex: 0.7, backgroundColor: "#0d0d0d", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", padding: "0 2rem" },
  formWrapper: { width: "100%", maxWidth: "360px" },
  logo: { height: "110px", width: "330px", objectFit: "contain", marginBottom: "30px" },
  title: { fontSize: "26px", fontWeight: "bold", marginBottom: "8px" },
  subtitle: { fontSize: "14px", color: "#9ca3af", marginBottom: "30px" },
  label: { fontSize: "14px", fontWeight: "500", marginBottom: "6px", display: "block" },
  input: { width: "100%", padding: "12px", marginBottom: "16px", border: "1px solid #333", borderRadius: "6px", fontSize: "15px", backgroundColor: "#111827", color: "#fff" },
  formFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 20px", fontSize: "14px" },
  checkboxLabel: { fontSize: "14px", display: "flex", alignItems: "center" },
  checkbox: { marginRight: 6 },
  link: { color: "#f87171", textDecoration: "none", cursor: "pointer" },
  primaryButton: { width: "100%", padding: "12px", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginBottom: "12px", transition: "background 0.3s" },
  secondaryButton: { width: "100%", padding: "12px", backgroundColor: "#111827", color: "#fff", border: "1px solid #374151", borderRadius: "6px", fontSize: "15px", fontWeight: "bold", cursor: "pointer", marginBottom: "12px" },
  error: { color: "#f87171", marginTop: "15px", fontSize: "14px" },
  success: { color: "#86efac", marginTop: "15px", fontSize: "14px" },
  imageSide: { flex: 1.3, backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" },
  image: { width: "100%", height: "100%", objectFit: "cover", objectPosition: "right" },
};
