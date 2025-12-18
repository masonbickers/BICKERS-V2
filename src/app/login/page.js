"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

  // MFA state
  const [step, setStep] = useState(1); // 1 = login/signup, 2 = MFA code
  const [mfaCode, setMfaCode] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // ✅ Password strength check
  const isStrongPassword = (password) => {
    const regex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  // ✅ Safe upsert: never overwrites existing mfaSecret unless you explicitly set it elsewhere
  const upsertUserDoc = async (user, { name: fullName = "", phone: phoneNumber = "" } = {}) => {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    const baseIfNew = snap.exists()
      ? {}
      : {
          createdAt: serverTimestamp(),
          isEnabled: true,
          role: "user",
          mfaSecret: null, // default for new users only
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

  // ✅ Handle Login / Signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const cleanEmail = (email || "").trim().toLowerCase();

      // 🚨 Restrict to company emails only
      if (!cleanEmail.endsWith("@bickers.co.uk")) {
        setError("Only @bickers.co.uk emails are allowed.");
        return;
      }

      if (isLogin) {
        // LOGIN
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const user = cred.user;

        if (!user.emailVerified) {
          setError("Please verify your email before logging in.");
          return;
        }

        // ✅ Make sure the UID user doc exists + updatedAt is refreshed (won't wipe mfaSecret)
        const ref = await upsertUserDoc(user);

        // ✅ Fetch MFA secret
        const snap = await getDoc(ref);

        if (!snap.exists() || !snap.data().mfaSecret) {
          router.push("/setup-mfa");
          return;
        }

        setCurrentUser({
          uid: user.uid,
          email: user.email,
          secret: snap.data().mfaSecret,
        });
        setStep(2);
      } else {
        // SIGN UP
        if (!isStrongPassword(password)) {
          setError(
            "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
          );
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
        const user = userCredential.user;

        // ✅ Create/merge user doc using UID as docId (prevents duplicates forever)
        await upsertUserDoc(user, { name, phone });

        // ✅ Send verification
        await sendEmailVerification(user);
        setError("Account created. Please verify your email before logging in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err?.message || "Login error");
    }
  };

  // MFA Verification (placeholder for now)
  const handleVerifyMFA = () => {
    try {
      router.push("/home");
    } catch (err) {
      setError("Error verifying code");
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

          {step === 1 && (
            <>
              <h1 style={styles.title}>
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <p style={styles.subtitle}>
                {isLogin ? "Please enter your details" : "Fill in your details to sign up"}
              </p>

              <form onSubmit={handleSubmit}>
                {!isLogin && (
                  <>
                    <label style={styles.label}>Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      style={styles.input}
                    />

                    <label style={styles.label}>Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      style={styles.input}
                    />
                  </>
                )}

                <label style={styles.label}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={styles.input}
                />

                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={styles.input}
                />

                {!isLogin && (
                  <>
                    <label style={styles.label}>Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      style={styles.input}
                    />
                  </>
                )}

                <div style={styles.formFooter}>
                  {isLogin && (
                    <label style={styles.checkboxLabel}>
                      <input type="checkbox" style={styles.checkbox} />
                      Remember for 30 days
                    </label>
                  )}
                  <a href="#" style={styles.link}>
                    Forgot password
                  </a>
                </div>

                <button type="submit" style={styles.primaryButton}>
                  {isLogin ? "Sign in" : "Sign up"}
                </button>

                <p style={styles.toggleText}>
                  {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                  <a
                    href="#"
                    onClick={() => setIsLogin(!isLogin)}
                    style={styles.link}
                  >
                    {isLogin ? "Sign up" : "Log in"}
                  </a>
                </p>

                {error && <p style={styles.error}>{error}</p>}
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={styles.title}>Enter Authenticator Code</h1>
              <p style={styles.subtitle}>
                Open your Google Authenticator app and enter the 6-digit code
              </p>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                maxLength={6}
                placeholder="123456"
                style={styles.input}
              />
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleVerifyMFA}
              >
                Verify Code
              </button>
              {error && <p style={styles.error}>{error}</p>}
            </>
          )}
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

// ✅ Styles unchanged
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
  error: { color: "#f87171", marginTop: "15px", fontSize: "14px" },
  imageSide: { flex: 1.3, backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" },
  image: { width: "100%", height: "100%", objectFit: "cover", objectPosition: "right" },
};
