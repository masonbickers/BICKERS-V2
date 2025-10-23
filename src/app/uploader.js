// utils/recceUpload.js
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import * as ImageManipulator from "expo-image-manipulator";
import { storage } from "../firebaseConfig"; // adjust path if needed

/**
 * Upload an array of images to Firebase Storage (Expo-safe).
 * Each photo is { uri: string, base64?: string }.
 * Returns an array of download URLs.
 */
export async function uploadReccePhotos({
  uid,
  bookingId,
  dateISO,
  photos,           // [{ uri, base64? }]
  maxWidth = 1600,  // resize for faster uploads
  quality = 0.8,    // JPEG compression 0..1
}) {
  const urls = [];

  for (let i = 0; i < photos.length; i++) {
    try {
      // Ensure base64 by re-encoding via ImageManipulator (handles file://, ph://, content://)
      const input = photos[i];
      const sourceUri = input.base64
        ? `data:image/jpeg;base64,${input.base64}`
        : input.uri;

      const manipulated = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: maxWidth } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const base64 = manipulated.base64;
      if (!base64) {
        console.warn(`uploadReccePhotos: PHOTO[${i}] had no base64 after manipulation`);
        continue;
      }

      const filename = `${Date.now()}_${i}.jpg`;
      const path = `recce-photos/${uid || "unknown"}/${bookingId}/${dateISO}/${filename}`;
      const objectRef = ref(storage, path);

      // Expo-friendly: upload base64 directly
      await uploadString(objectRef, base64, "base64", {
        contentType: "image/jpeg",
        customMetadata: { uid: String(uid || ""), bookingId: String(bookingId || ""), dateISO: String(dateISO || "") },
      });

      const url = await getDownloadURL(objectRef);
      urls.push(url);
      console.log(`Uploaded ${i + 1}/${photos.length} →`, url);
    } catch (err) {
      console.warn(`uploadReccePhotos error @ ${i}`, err?.code || "", err?.message || String(err));
    }
  }

  return urls;
}
