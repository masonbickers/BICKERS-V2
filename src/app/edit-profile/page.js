"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ImageUp, Mail, Save, UserRound } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ------------------------------- Styling tokens ------------------------------- */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  dangerSoft: "#fcefee",
  dangerText: "#991b1b",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, maxWidth: 760 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const card = {
  ...surface,
  padding: 12,
};

const fieldLabel = { fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: 0 };
const input = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "#fff",
  fontSize: 13.5,
  outline: "none",
  color: UI.text,
  boxSizing: "border-box",
};
const helper = { color: UI.muted, fontSize: 12, lineHeight: 1.35, marginTop: 5 };

const btnBase = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.text,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
};
const btnPrimary = {
  ...btnBase,
  background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
  borderColor: UI.brand,
  color: "#fff",
};
const btnSoft = { ...btnBase, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand };
const detailCard = { padding: 10, border: UI.border, borderRadius: UI.radius, background: "#fff" };
const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 800, color: UI.text, lineHeight: 1.2 };
const sectionSub = { color: UI.muted, fontSize: 12.5, lineHeight: 1.45, marginTop: 5 };

const avatarWrap = {
  width: 52,
  height: 52,
  borderRadius: UI.radius,
  overflow: "hidden",
  border: UI.border,
  background: UI.brandSoft,
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  color: UI.text,
};

const editProfileCss = `
  @media (max-width: 1180px) {
    .edit-profile-layout,
    .edit-profile-fields,
    .edit-profile-actions {
      grid-template-columns: 1fr !important;
    }
  }
`;

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
      } catch {
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
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoURL} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      );
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
      setError("Name can't be empty.");
      return;
    }

    setSaving(true);
    try {
      const newPhotoURL = await uploadPhotoIfNeeded();

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: trimmed,
          photoURL: newPhotoURL || auth.currentUser.photoURL || null,
        });
      }

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
      <style>{editProfileCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Edit profile</h1>
            <div style={sub}>Update your account details and profile photo.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>
              <UserRound size={14} />
              {loading ? "Loading..." : "Profile"}
            </div>
            {saving ? (
              <div style={{ ...chip, color: UI.brand }}>
                <CheckCircle2 size={14} />
                Saving...
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 12, textAlign: "center", color: UI.muted }}>Loading profile...</div>
        ) : (
          <div
            className="edit-profile-layout"
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: UI.gap }}
          >
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={avatarWrap}>{avatarNode}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: UI.text }}>{name || "-"}</div>
                  <div style={{ color: UI.muted, fontSize: 13 }}>{email || "-"}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "#e7edf4", margin: "12px 0" }} />

              <div className="edit-profile-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={fieldLabel}>Name</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Your name" />
                  <div style={helper}>This is shown across the app.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Email</div>
                  <input value={email} disabled style={{ ...input, background: "#f8fbfd" }} />
                  <div style={helper}>Email is managed by your login account.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Role</div>
                  <input value={role || "-"} disabled style={{ ...input, background: "#f8fbfd" }} />
                  <div style={helper}>Role is controlled by admins.</div>
                </div>

                <div>
                  <div style={fieldLabel}>Profile photo</div>
                  <input type="file" accept="image/*" onChange={onPickFile} style={input} />
                  <div style={helper}>
                    Upload a square image for best results. {uploadPct > 0 ? <b>Upload: {uploadPct}%</b> : null}
                  </div>
                </div>
              </div>

              {error ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 10px",
                    borderRadius: UI.radius,
                    border: "1px solid #f1b8b8",
                    background: UI.dangerSoft,
                    color: UI.dangerText,
                    fontWeight: 800,
                    fontSize: 12.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <AlertTriangle size={14} />
                  {error}
                </div>
              ) : null}

              <div
                className="edit-profile-actions"
                style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
              >
                <button type="button" style={btnSoft} onClick={() => router.push("/settings")} disabled={saving}>
                  <ArrowLeft size={14} />
                  Cancel
                </button>
                <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                  <Save size={14} />
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            <div style={card}>
              <h2 style={sectionTitle}>Profile tips</h2>
              <div style={sectionSub}>
                Keep names consistent for job sheets and staff allocation. Use a clear headshot if you add a photo.
              </div>

              <div style={{ ...detailCard, marginTop: 12 }}>
                <div style={fieldLabel}>Preview</div>
                <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ ...avatarWrap, width: 44, height: 44 }}>{avatarNode}</div>
                  <div>
                    <div style={{ fontWeight: 800, color: UI.text }}>{name || "-"}</div>
                    <div style={{ color: UI.muted, fontSize: 13 }}>{email || "-"}</div>
                  </div>
                </div>
              </div>

              <div style={{ ...detailCard, marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI.text, fontWeight: 800, fontSize: 13 }}>
                  <ImageUp size={15} color={UI.brand} />
                  Photo and account data
                </div>
                <div style={{ ...sectionSub, marginTop: 6 }}>
                  Profile photos are stored against your account. Display name and photo changes update the app header after save.
                </div>
              </div>

              <div style={{ ...detailCard, marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI.text, fontWeight: 800, fontSize: 13 }}>
                  <Mail size={15} color={UI.brand} />
                  Login email
                </div>
                <div style={{ ...sectionSub, marginTop: 6 }}>Email and role are locked here so the login and permissions stay controlled.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
