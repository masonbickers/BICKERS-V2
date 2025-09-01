import { db } from "../../../../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import speakeasy from "speakeasy";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { uid, token } = req.body;

  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists() || !snap.data().mfaSecret) {
      return res.status(400).json({ error: "MFA not set up" });
    }

    const secret = snap.data().mfaSecret;

    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1, // allow slight clock drift
    });

    if (!verified) {
      return res.status(401).json({ error: "Invalid code" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
