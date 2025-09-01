"use client";

import { useState, useEffect } from "react";
import { auth, db } from "../../../firebaseConfig";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";   // ✅ QRCodeCanvas
import speakeasy from "speakeasy";

export default function SetupMFA() {
  const router = useRouter();
  const [secret, setSecret] = useState(null);
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [error, setError] = useState("");

  // Generate MFA secret when page loads
  useEffect(() => {
    const secretGen = speakeasy.generateSecret({
      name: "Bickers Booking",
    });

    setSecret(secretGen.base32);
    setOtpauthUrl(secretGen.otpauth_url);
  }, []);

  const handleConfirm = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setError("No logged in user.");
        return;
      }

      // ✅ Save secret in Firestore
      await setDoc(
        doc(db, "users", user.uid),
        { mfaSecret: secret },
        { merge: true }
      );

      router.push("/home"); // redirect once saved
    } catch (err) {
      setError("Error saving setup: " + err.message);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <h1 style={styles.title}>Set up MFA</h1>
          <p style={styles.subtitle}>
            Scan this QR code with Google Authenticator to enable 2FA.
          </p>

          {otpauthUrl && (
            <div style={{ marginBottom: 20 }}>
              {/* ✅ Show QR code only */}
              <QRCodeCanvas value={otpauthUrl} size={200} />
            </div>
          )}

          <button onClick={handleConfirm} style={styles.primaryButton}>
            Confirm Setup
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </div>
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
  error: {
    color: "#f87171",
    marginTop: "15px",
    fontSize: "14px",
  },
};
