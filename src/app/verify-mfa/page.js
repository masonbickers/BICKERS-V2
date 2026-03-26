"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import speakeasy from "speakeasy"; //  install: npm install speakeasy
import Image from "next/image";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";
import {
  hasAuthenticatorMfa,
  isPhoneVerified,
  markMfaVerified,
} from "@/app/utils/authSecurity";

export default function VerifyMfaPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const userData = snap.data() || {};
      if (!isPhoneVerified(userData) || !hasAuthenticatorMfa(userData)) {
        router.replace("/setup-mfa");
        return;
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleVerify = async () => {
    try {
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

      const { mfaSecret } = userData;

      //  Verify code with speakeasy
      const verified = speakeasy.totp.verify({
        secret: mfaSecret,
        encoding: "base32",
        token: code,
      });

      if (verified) {
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
        setError("Invalid code, try again.");
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
        <button onClick={handleVerify} style={styles.button}>
          Verify Code
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
  error: { color: "#f87171", marginTop: "10px" },
};
