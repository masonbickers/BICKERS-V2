import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "AIzaSyBiKz88kMEAB5C-oRn3qN6E7KooDcmYTWE";

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

export async function verifyFirebaseIdTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        cache: "no-store",
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.localId) return null;
    const tokenPayload = decodeJwtPayload(idToken);
    const email = String(
      user.email ||
        tokenPayload.email ||
        tokenPayload.companyEmail ||
        ""
    ).toLowerCase();

    return {
      uid: user.localId,
      email,
    };
  } catch (error) {
    console.error("Firebase ID token lookup failed:", error);
    return null;
  }
}

export async function getVerifiedUserDoc(req) {
  const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
  if (!verifiedUser?.uid) return null;

  const userSnap = await getDoc(doc(db, "users", verifiedUser.uid));
  const userData = userSnap.data() || {};
  if (userData?.isEnabled === false) return null;

  return {
    verifiedUser,
    userSnap,
    userData,
  };
}
