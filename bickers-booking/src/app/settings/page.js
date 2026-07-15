"use client";

import { useEffect, useState } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function SettingsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData({
          name: data.name || "No name",
          email: user.email,
          role: data.role || "No role",
          photoURL: data.photoURL || null,
        });
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <HeaderSidebarLayout>
    <div style={styles.page}>
      <h1 style={styles.title}>Account Settings</h1>

      {loading ? (
        <p style={styles.loading}>Loading settings...</p>
      ) : userData ? (
        <div style={styles.card}>
          <div style={styles.row}>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={userData.name} disabled />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} value={userData.email} disabled />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Role</label>
            <input style={styles.input} value={userData.role} disabled />
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/edit-profile")}>
              Edit Profile
            </button>
            <button style={styles.secondaryBtn} onClick={() => router.push("/change-password")}>
              Change Password
            </button>
            <button style={styles.signOutBtn} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <p style={styles.loading}>User data not found.</p>
      )}
    </div>
    </HeaderSidebarLayout>
  );
}

const styles = {
  page: {
    backgroundColor: "#0d0d0d",
    color: "#f2f2f2",
    minHeight: "100vh",
    padding: "2rem",
    fontFamily: "'Segoe UI', sans-serif",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    marginBottom: "2rem",
  },
  card: {
    backgroundColor: "#1a1a1a",
    padding: "2rem",
    borderRadius: "10px",
    width: "100%",
    maxWidth: "500px",
    boxShadow: "none",

  },
  row: {
    marginBottom: "1.5rem",
    display: "flex",
    flexDirection: "column",
  },
  label: {
    fontSize: "0.9rem",
    marginBottom: "0.25rem",
    color: "#aaa",
  },
  input: {
    backgroundColor: "#2a2a2a",
    border: "none",
    borderRadius: "6px",
    padding: "0.75rem",
    color: "#f2f2f2",
    fontSize: "0.95rem",
  },
  buttonRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "2rem",
  },
  secondaryBtn: {
    backgroundColor: "#2d2d2d",
    color: "#f2f2f2",
    border: "1px solid #444",
    borderRadius: "6px",
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  signOutBtn: {
    backgroundColor: "#b72c2c",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  loading: {
    fontSize: "1rem",
    color: "#888",
  },
};
