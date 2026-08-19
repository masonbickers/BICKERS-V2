"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../../firebaseConfig";
import { v4 } from "uuid";

export default function UploadPage() {
  const [imageUpload, setImageUpload] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);

  const uploadFile = () => {
    if (!imageUpload) return;

    const imageRef = ref(storage, `images/${imageUpload.name + v4()}`);
    uploadBytes(imageRef, imageUpload).then((snapshot) => {
      getDownloadURL(snapshot.ref).then((url) => {
        setImageUrls((prev) => [...prev, url]);
      });
    }).catch((error) => {
      systemDialogs.showSystemNotification("Upload failed: " + error.message);
    });
  };

  return (
    <div className={`App ${layoutStyles.extracted1}`} >
      <h2>Upload File</h2>
      <input
        type="file"
        onChange={(event) => setImageUpload(event.target.files[0])}
      />
      <button onClick={uploadFile}>Upload Image</button>

      {imageUrls.map((url, i) => (
        <div key={i}>

        </div>
      ))}
    </div>
  );
}
