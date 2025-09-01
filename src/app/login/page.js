"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, googleProvider } from "../../../firebaseConfig"; // ✅ import provider + db
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // ✅ Save new user in Firestore
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          role: "user",
          createdAt: new Date(),
        });
      }

      router.push("/home");
    } catch (err) {
      setError(err.message);
    }
  };

  // ✅ Google Login Function
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // ✅ Save to Firestore (merge to avoid overwriting)
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email,
          role: "user",
          createdAt: new Date(),
        },
        { merge: true }
      );

      router.push("/home");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={styles.page}>
      {/* Left Side: Login form */}
      <div style={styles.formSide}>
        <div style={styles.formWrapper}>
          <Image
            src="/bickers-action-logo.png"
            alt="Bickers Logo"
            width={330}
            height={110}
            style={styles.logo}
          />

          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>Please enter your details</p>

          <form onSubmit={handleSubmit}>
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

            <div style={styles.formFooter}>
              <label style={styles.checkboxLabel}>
                <input type="checkbox" style={styles.checkbox} />
                Remember for 30 days
              </label>
              <a href="#" style={styles.link}>
                Forgot password
              </a>
            </div>

            <button type="submit" style={styles.primaryButton}>
              {isLogin ? "Sign in" : "Sign up"}
            </button>

            {/* ✅ Google Login Button (matches style) */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              style={styles.googleButton}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                style={{ width: 20, marginRight: 10 }}
              />
              Sign in with Google
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
        </div>
      </div>

      {/* Right Side: Image */}
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

const styles = {
  page: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#0d0d0d",
    fontFamily: "Arial, sans-serif",
  },
  formSide: {
    flex: 0.7,
    backgroundColor: "#0d0d0d",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0 2rem",
  },
  formWrapper: {
    width: "100%",
    maxWidth: "360px",
  },
  logo: {
    height: "110px",
    width: "330px",
    objectFit: "contain",
    marginBottom: "30px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#9ca3af",
    marginBottom: "30px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "6px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "16px",
    border: "1px solid #333",
    borderRadius: "6px",
    fontSize: "15px",
    backgroundColor: "#111827",
    color: "#fff",
  },
  formFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "10px 0 20px",
    fontSize: "14px",
  },
  checkboxLabel: {
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
  },
  checkbox: {
    marginRight: 6,
  },
  link: {
    color: "#f87171",
    textDecoration: "none",
    cursor: "pointer",
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
    marginBottom: "12px",
    transition: "background 0.3s",
  },
  googleButton: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#fff",
    color: "#000",
    border: "1px solid #ccc",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
  },
  toggleText: {
    marginTop: 25,
    fontSize: "14px",
    color: "#9ca3af",
  },
  error: {
    color: "#f87171",
    marginTop: "15px",
    fontSize: "14px",
  },
  imageSide: {
    flex: 1.3,
    backgroundColor: "#1a1a1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "right",
  },
};
