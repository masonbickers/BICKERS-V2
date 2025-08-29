// src/app/test/page.js
"use client";

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebaseConfig";


export default function UploadPdfPage() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const onChoose = (e) => {
    const f = e.target.files?.[0];
    setError(""); setUrl(""); setStatus(""); setProgress(0);
    if (!f) return;
    const t = (f.type || "").toLowerCase();
    if (t !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF (.pdf).");
      return;
    }
    setFile(f);
  };

  const onUpload = () => {
    if (!file) { setError("No PDF selected."); return; }
    setError(""); setStatus("Uploading…");

    const objectRef = ref(storage, `uploads/${Date.now()}-${file.name}`);
    const task = uploadBytesResumable(objectRef, file, {
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${file.name}"`,
    });

    task.on("state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgress(pct);
      },
      (err) => {
        setStatus("Failed ❌");
        setError(`${err.code || "error"}: ${err.message || String(err)}`);
      },
      async () => {
        const downloadURL = await getDownloadURL(task.snapshot.ref);
        setUrl(downloadURL);
        setStatus("✅ Upload complete");
      }
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h1>Upload a PDF</h1>
      <input type="file" accept="application/pdf" onChange={onChoose} />
      <button onClick={onUpload} style={{ marginLeft: 10, padding: "8px 14px" }}>
        Upload
      </button>
      {progress > 0 && <p>Progress: {progress}%</p>}
      {status && <p>{status}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {url && <p><a href={url} target="_blank" rel="noopener noreferrer">View PDF</a></p>}
    </div>
  );
}
