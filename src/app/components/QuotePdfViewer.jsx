"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Modal, Spinner } from "@/app/components/ui";
import styles from "./QuotePdfViewer.module.css";

const pdfViewerUrl = (url = "") => {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  return `${cleanUrl.split("#")[0]}#page=1&zoom=50&navpanes=0&pagemode=none`;
};

export default function QuotePdfViewer({ viewer, onClose }) {
  const [loadedUrl, setLoadedUrl] = useState("");
  const url = String(viewer?.url || "").trim();
  const quoteNumber = String(viewer?.quoteNumber || "").trim();
  const jobNumber = String(viewer?.jobNumber || "").trim();
  const client = String(viewer?.client || "").trim();

  if (!url) return null;

  const loading = loadedUrl !== url;

  const title = quoteNumber ? `Quote ${quoteNumber}` : "Quote PDF";
  const description = [jobNumber ? `Job #${jobNumber}` : "", client]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Quote document"
      title={title}
      description={description || "Uploaded quote PDF"}
      size="full"
      density="compact"
      className={styles.viewerModal}
      bodyClassName={styles.viewerBody}
      headerActions={
        <Button
          as="a"
          href={url}
          download={`Quote-${quoteNumber || jobNumber || "document"}.pdf`}
          variant="secondary"
          size="sm"
        >
          <Download size={15} /> Download
        </Button>
      }
    >
      <div className={styles.frameWrap}>
        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <Spinner />
            <strong>Loading quote PDF…</strong>
            <span>Opening the document viewer.</span>
          </div>
        ) : null}
        <iframe
          key={url}
          src={pdfViewerUrl(url)}
          title={title}
          className={styles.pdfFrame}
          onLoad={() => setLoadedUrl(url)}
        />
      </div>
    </Modal>
  );
}
