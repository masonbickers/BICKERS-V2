"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const card = {
  ...surface,
  padding: 16,
};

const fieldLabel = { fontSize: 12, fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.02em" };
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
  outline: "none",
  color: UI.text,
};
const helper = { color: UI.muted, fontSize: 12, marginTop: 6 };

const btnBase = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};
const btnPrimary = { ...btnBase, background: UI.brand, borderColor: UI.brand, color: "#fff" };
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand };

const avatarWrap = {
  width: 56,
  height: 56,
  borderRadius: 999,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  color: UI.text,
};

function initials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export default function EditProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [uid, setUid] = useState(null);

  // form
  const [name, setName] = useState("");
  const [email, setEmail] = useState(""); // display only
  const [role, setRole] = useState(""); // display only
  const [photoURL, setPhotoURL] = useState(null);

  // upload
  const [file, setFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      setUid(user.uid);
      setEmail(user.email || "");

      try {
        const docRef = doc(db, "users", user.uid);
        const snap = await getDoc(docRef);

        const firestore = snap.exists() ? snap.data() || {} : {};
        const displayName = firestore.name || user.displayName || "";
        const firestoreRole = firestore.role || "";
        const firestorePhoto = firestore.photoURL || user.photoURL || null;

        setName(displayName || "");
        setRole(firestoreRole || "");
        setPhotoURL(firestorePhoto || null);
      } catch (e) {
        // fallback to auth data
        setName(user.displayName || "");
        setPhotoURL(user.photoURL || null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const avatarNode = useMemo(() => {
    if (photoURL) {
      return <img src={photoURL} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
    }
    return <span>{initials(name)}</span>;
  }, [photoURL, name]);

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setUploadPct(0);
    setError("");
  };

  const uploadPhotoIfNeeded = async () => {
    if (!file || !uid) return photoURL || null;

    // basic validation
    if (!file.type?.startsWith("image/")) {
      setError("Please upload an image file (jpg/png/webp).");
      return null;
    }

    const path = `profilePhotos/${uid}/${Date.now()}_${file.name}`;
    const r = ref(storage, path);
    const task = uploadBytesResumable(r, file);

    const url = await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setUploadPct(pct);
        },
        (err) => reject(err),
        async () => {
          const dl = await getDownloadURL(task.snapshot.ref);
          resolve(dl);
        }
      );
    });

    return url;
  };

  const handleSave = async () => {
    setError("");
    if (!uid) return;

    const trimmed = String(name || "").trim();
    if (!trimmed) {
      setError("Name can’t be empty.");
      return;
    }

    setSaving(true);
    try {
      const newPhotoURL = await uploadPhotoIfNeeded();

      // update Auth profile (so header/avatar can use auth data too)
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: trimmed,
          photoURL: newPhotoURL || auth.currentUser.photoURL || null,
        });
      }

      // update Firestore user doc
      await setDoc(
        doc(db, "users", uid),
        {
          name: trimmed,
          photoURL: newPhotoURL || photoURL || null,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setPhotoURL(newPhotoURL || photoURL || null);
      setFile(null);
      setUploadPct(0);

      router.push("/settings");
    } catch (e) {
      setError(e?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Edit profile</h1>
            <div style={sub}>Update your account details. Style matches Jobs Home.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading…" : "Profile"}</div>
            {saving ? (
              <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>Saving…</div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>Loading profile…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: UI.gap }}>
            {/* Main */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={avatarWrap}>{avatarNode}</div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{name || "—"}</div>
                  <div style={{ color: UI.muted, fontSize: 13 }}>{email || "—"}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "#eef2f7", margin: "14px 0" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={fieldLabel}>Name</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Your name" />
                  <div style={helper}>This is shown across the app.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Email</div>
                  <input value={email} disabled style={{ ...input, background: "#f8fafc" }} />
                  <div style={helper}>Email is managed by your login account.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Role</div>
                  <input value={role || "—"} disabled style={{ ...input, background: "#f8fafc" }} />
                  <div style={helper}>Role is controlled by admins.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Profile photo</div>
                  <input type="file" accept="image/*" onChange={onPickFile} style={{ ...input, padding: 8 }} />
                  <div style={helper}>
                    Upload a square image for best results. {uploadPct > 0 ? <b>Upload: {uploadPct}%</b> : null}
                  </div>
                </div>
              </div>

              {error ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fee2e2",
                    color: "#991b1b",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" style={btnSoft} onClick={() => router.push("/settings")} disabled={saving}>
                  Cancel
                </button>
                <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

            {/* Side panel (ignore content, just for layout parity) */}
            <div style={card}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Profile tips</div>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                Keep names consistent for job sheets and staff allocation. Use a clear headshot if you add a photo.
              </div>

              <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
                <div style={fieldLabel}>Preview</div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ ...avatarWrap, width: 44, height: 44 }}>{avatarNode}</div>
                  <div>
                    <div style={{ fontWeight: 900 }}>{name || "—"}</div>
                    <div style={{ color: UI.muted, fontSize: 13 }}>{email || "—"}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, color: UI.muted, fontSize: 12 }}>
                Note: this page writes to <b>users/{`{uid}`}</b> and also updates the Firebase Auth displayName/photoURL.
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
