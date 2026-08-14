"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Download, Eye, FileImage, FileText, X } from "lucide-react";
import { Button, Modal } from "@/app/components/ui";
import styles from "./PersonnelDocumentViewer.module.css";

function decodedFileName(url = "") {
  try {
    const decoded = decodeURIComponent(String(url).split("?")[0]);
    return decoded.split("/").pop() || "Document";
  } catch {
    return "Document";
  }
}

function documentKind(url = "", title = "") {
  const value = `${decodedFileName(url)} ${title}`.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|bmp)(?:\s|$)/.test(value)) return "image";
  if (/\.pdf(?:\s|$)/.test(value)) return "pdf";
  return "file";
}

export default function PersonnelDocumentViewer({ url, title, type = "Document", compact = false }) {
  const [open, setOpen] = useState(false);
  const kind = useMemo(() => documentKind(url, title), [title, url]);
  const displayTitle = title || decodedFileName(url);
  const Icon = kind === "image" ? FileImage : FileText;

  if (!url) {
    return (
      <div className={`${styles.documentCard} ${styles.empty}`}>
        <Icon size={18} />
        <span><strong>No document uploaded</strong><small>Add a file below, then save changes.</small></span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.documentCard} ${compact ? styles.compact : ""}`}
        onClick={() => setOpen(true)}
      >
        <span className={styles.documentIcon}><Icon size={19} /></span>
        <span className={styles.documentDetails}>
          <strong>{displayTitle}</strong>
          <small>{kind === "image" ? "Image" : kind === "pdf" ? "PDF document" : type}</small>
        </span>
        <span className={styles.viewAction}><Eye size={16} /> Preview</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={displayTitle}
        eyebrow={type}
        description={kind === "file" ? "This file type cannot be previewed in the browser." : "Secure personnel document preview"}
        size="xl"
        className={styles.viewerModal}
        bodyClassName={styles.viewerBody}
        footer={
          <>
            <Button as="a" href={url} download={displayTitle} variant="secondary">
              <Download size={16} /> Download
            </Button>
            <Button onClick={() => setOpen(false)}><X size={16} /> Close</Button>
          </>
        }
      >
        {kind === "image" ? (
          <div className={styles.imageStage}>
            <Image src={url} alt={displayTitle} fill unoptimized sizes="90vw" />
          </div>
        ) : null}
        {kind === "pdf" ? <iframe className={styles.pdfFrame} src={url} title={displayTitle} /> : null}
        {kind === "file" ? (
          <div className={styles.unsupportedState}>
            <FileText size={42} />
            <h3>Preview unavailable</h3>
            <p>Download the original file to view it in the appropriate application.</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
