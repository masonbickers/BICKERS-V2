"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import styles from "./SystemNotificationHost.module.css";
import {
  consumeQueuedSystemNotification,
  SYSTEM_DIALOG_EVENT,
  SYSTEM_NOTIFICATION_EVENT,
} from "@/app/utils/systemNotifications";

const iconByType = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

export default function SystemNotificationHost() {
  const [mounted, setMounted] = useState(false);
  const [notification, setNotification] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [promptValue, setPromptValue] = useState("");

  useEffect(() => {
    setMounted(true);
    const queued = consumeQueuedSystemNotification();
    if (queued) setNotification(queued);

    const handleNotification = (event) => setNotification(event.detail || null);
    const handleDialog = (event) => {
      const nextDialog = event.detail || null;
      setDialog(nextDialog);
      setPromptValue(nextDialog?.defaultValue || "");
    };
    window.addEventListener(SYSTEM_NOTIFICATION_EVENT, handleNotification);
    window.addEventListener(SYSTEM_DIALOG_EVENT, handleDialog);
    return () => {
      window.removeEventListener(SYSTEM_NOTIFICATION_EVENT, handleNotification);
      window.removeEventListener(SYSTEM_DIALOG_EVENT, handleDialog);
    };
  }, []);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = window.setTimeout(
      () => setNotification(null),
      notification.duration || 3500
    );
    const queuedCleanupTimer = notification.queued
      ? window.setTimeout(() => consumeQueuedSystemNotification(), 500)
      : null;
    return () => {
      window.clearTimeout(timer);
      if (queuedCleanupTimer) window.clearTimeout(queuedCleanupTimer);
    };
  }, [notification]);

  if (!mounted || (!notification && !dialog)) return null;

  const Icon = notification ? iconByType[notification.type] || Info : Info;
  const closeDialog = (value) => {
    dialog?.resolve?.(value);
    setDialog(null);
  };
  return createPortal(
    <>
      {notification ? (
        <div className={styles.viewport} aria-live="polite" aria-atomic="true">
          <section className={styles.notification} data-type={notification.type} role="status">
            <span className={styles.icon} aria-hidden="true"><Icon size={20} /></span>
            <div className={styles.content}>
              <strong>{notification.title}</strong>
              {notification.message ? <p>{notification.message}</p> : null}
            </div>
            <button type="button" onClick={() => setNotification(null)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </section>
        </div>
      ) : null}
      {dialog ? (
        <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog(dialog.kind === "confirm" ? false : null)}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="system-dialog-title">
            <div className={styles.dialogHeader}>
              <span className={styles.dialogIcon} data-danger={dialog.danger || undefined} aria-hidden="true">
                {dialog.danger ? <AlertTriangle size={20} /> : <Info size={20} />}
              </span>
              <div>
                <h2 id="system-dialog-title">{dialog.title}</h2>
                <p>{dialog.message}</p>
              </div>
            </div>
            {dialog.kind === "prompt" ? (
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") closeDialog(promptValue);
                  if (event.key === "Escape") closeDialog(null);
                }}
              />
            ) : null}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.cancelButton} onClick={() => closeDialog(dialog.kind === "confirm" ? false : null)}>{dialog.cancelLabel}</button>
              <button type="button" className={dialog.danger ? styles.dangerButton : styles.confirmButton} onClick={() => closeDialog(dialog.kind === "prompt" ? promptValue : true)}>{dialog.confirmLabel}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>,
    document.body
  );
}
