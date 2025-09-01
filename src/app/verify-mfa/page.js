"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import speakeasy from "speakeasy"; // ✅ install: npm install speakeasy
import Image from "next/image";

export default function VerifyMfaPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleVerify = async () => {
    try {
      // ✅ Get current user from localStorage or Firebase Auth
      const user = JSON.parse(localStorage.getItem("user")); 
      if (!user) {
        setError("No user found. Please login again.");
        router.push("/login");
        return;
      }

      // ✅ Load secret key from Firestore
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        setError("No MFA setup found.");
        return;
      }

      const { mfaSecret } = snap.data();

      // ✅ Verify code with speakeasy
      const verified = speakeasy.totp.verify({
        secret: mfaSecret,
        encoding: "base32",
        token: code,
      });

      if (verified) {
        router.push("/home"); // 🎉 success
      } else {
        setError("Invalid code, try again.");
      }
    } catch (err) {
      setError(err.message);
    }
  };

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
