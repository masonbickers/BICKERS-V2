"use client";

import { useEffect, useRef } from "react";

const STORE_KEY = "__bickersUnsavedChangesGuard";
export const UNSAVED_CHANGES_EVENT = "bickers:unsaved-changes";

function ensureStore() {
  if (typeof window === "undefined") return null;
  if (!window[STORE_KEY]) {
    window[STORE_KEY] = {
      ownerId: null,
      isDirty: false,
      message: "",
      saveLabel: "",
      onSave: null,
      bypassUntil: 0,
    };
  }
  return window[STORE_KEY];
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNSAVED_CHANGES_EVENT));
}

export function getUnsavedChangesState() {
  const store = ensureStore();
  if (!store) {
    return {
      ownerId: null,
      isDirty: false,
      message: "",
      saveLabel: "",
      onSave: null,
      bypassUntil: 0,
    };
  }
  return store;
}

export function setUnsavedChangesState(nextState) {
  const store = ensureStore();
  if (!store) return;
  const changed =
    store.ownerId !== nextState?.ownerId ||
    store.isDirty !== !!nextState?.isDirty ||
    store.message !== (nextState?.message || "") ||
    store.saveLabel !== (nextState?.saveLabel || "") ||
    store.onSave !== nextState?.onSave;
  Object.assign(store, nextState || {});
  if (changed) emitChange();
}

export function clearUnsavedChangesState(ownerId) {
  const store = ensureStore();
  if (!store) return;
  if (ownerId && store.ownerId && store.ownerId !== ownerId) return;
  store.ownerId = null;
  store.isDirty = false;
  store.message = "";
  store.saveLabel = "";
  store.onSave = null;
  store.bypassUntil = 0;
  emitChange();
}

export function bypassUnsavedChangesOnce(ms = 3000) {
  const store = ensureStore();
  if (!store) return;
  store.bypassUntil = Date.now() + ms;
  emitChange();
}

export function shouldBypassUnsavedChanges() {
  const store = ensureStore();
  if (!store) return false;
  return Number(store.bypassUntil || 0) > Date.now();
}

export function useUnsavedChangesGuard({
  enabled = true,
  isDirty = false,
  message = "You have unsaved changes on this page.",
  saveLabel = "Save & Leave",
  onSave = null,
}) {
  const ownerRef = useRef(
    `unsaved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
  const saveRef = useRef(onSave);

  saveRef.current = onSave;

  useEffect(() => {
    const ownerId = ownerRef.current;

    if (!enabled) {
      clearUnsavedChangesState(ownerId);
      return;
    }

    setUnsavedChangesState({
      ownerId,
      isDirty: !!isDirty,
      message,
      saveLabel,
      onSave: async () => {
        if (typeof saveRef.current !== "function") return true;
        return saveRef.current();
      },
    });

    return () => {
      clearUnsavedChangesState(ownerId);
    };
  }, [enabled, isDirty, message, saveLabel]);

  useEffect(() => {
    if (!enabled || !isDirty || typeof window === "undefined") return undefined;

    const handleBeforeUnload = (event) => {
      if (shouldBypassUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled, isDirty]);
}
