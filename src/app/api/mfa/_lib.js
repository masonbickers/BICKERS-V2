import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "AIzaSyBiKz88kMEAB5C-oRn3qN6E7KooDcmYTWE";

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

    return {
      uid: user.localId,
      email: String(user.email || "").toLowerCase(),
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
  return {
    verifiedUser,
    userSnap,
    userData: userSnap.data() || {},
  };
}
