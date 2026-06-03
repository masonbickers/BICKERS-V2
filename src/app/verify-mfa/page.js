"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import {
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import {
  hasAuthenticatorMfa,
  isMfaVerifiedOnDevice,
  isPhoneVerified,
  markMfaVerified,
} from "@/app/utils/authSecurity";
import { useAuth } from "@/app/context/authContext";

export default function VerifyMfaPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rememberDevice, setRememberDevice] = useState(true);
  const router = useRouter();
  const { refreshMfaState } = useAuth() || {};

  const refreshServerAccess = useCallback(async (user) => {
    if (!user?.getIdToken) return null;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/security/bootstrap-access", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? data?.access || null : null;
    } catch (error) {
      console.warn("[verify-mfa] access refresh skipped:", error);
      return null;
    }
  }, []);

  const readUserData = useCallback(async (user, access = null) => {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      return { ...(snap.exists() ? snap.data() || {} : {}), ...(access || {}) };
    } catch (error) {
      console.warn("[verify-mfa] user doc read failed after bootstrap:", error);
      return { ...(access || {}) };
    }
  }, []);

  const routeUserToWorkspace = useCallback(async (user, userData = {}) => {
    const role = String(userData?.role || "").toLowerCase();
    const isAdmin = ["admin", "platformadmin"].includes(role);
    const access = resolveEmployeeAccess(userData || {}, { isAdmin });
    const preferred =
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);
    router.replace(selectLandingRoute(access, preferred));
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const refreshedAccess = await refreshServerAccess(user);
      const userData = await readUserData(user, refreshedAccess);
      if (!isPhoneVerified(userData) || !hasAuthenticatorMfa(userData)) {
        router.replace("/setup-mfa");
        return;
      }

      const alreadyTrusted = isMfaVerifiedOnDevice(
        typeof window !== "undefined" ? window.localStorage : null,
        typeof window !== "undefined" ? window.sessionStorage : null,
        user.uid
      );
      if (alreadyTrusted) {
        refreshMfaState?.();
        await routeUserToWorkspace(user, userData);
        return;
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [readUserData, refreshMfaState, refreshServerAccess, routeUserToWorkspace, router]);

  const handleVerify = async () => {
    try {
      setError("");
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please login again.");
        router.push("/login");
        return;
      }

      const refreshedAccess = await refreshServerAccess(user);
      const userData = await readUserData(user, refreshedAccess);

      if (!userData?.uid && !userData?.role) {
        setError("No MFA setup found.");
        return;
      }

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
          secret: String(userData?.mfaSecret || ""),
        }),
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.ok) {
        const targetStorage =
          typeof window === "undefined"
            ? null
            : rememberDevice
            ? window.localStorage
            : window.sessionStorage;
        markMfaVerified(targetStorage, user.uid, rememberDevice ? { daysValid: 30 } : {});
        refreshMfaState?.();
        await routeUserToWorkspace(user, userData);
      } else {
        setError(verifyData?.error || "Invalid code, try again.");
      }
    } catch (err) {
      setError(err.message);
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
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            style={styles.checkbox}
          />
          Remember this computer for 30 days
        </label>
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
        {error && <p style={styles.error}>{error}</p>}
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
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "16px",
    color: "#d1d5db",
    fontSize: "14px",
  },
  checkbox: {
    width: "16px",
    height: "16px",
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
  error: { color: "#f87171", marginTop: "10px" },
};
