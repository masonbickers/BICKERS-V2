"use client";

import { useEffect, useRef, useState } from "react";

function readStoredValue(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function useSessionState(key, fallback) {
  const [value, setValue] = useState(() => readStoredValue(key, fallback));
  const keyRef = useRef(key);
  const skipNextWriteRef = useRef(false);

  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    skipNextWriteRef.current = true;
    setValue(readStoredValue(key, fallback));
  }, [fallback, key]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Session persistence is nice-to-have; ignore unavailable storage.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useSessionScroll(key, restoreWhen = true) {
  const restoreAttempted = useRef(false);

  useEffect(() => {
    if (!restoreWhen) return undefined;
    if (restoreAttempted.current) return undefined;
    restoreAttempted.current = true;

    const raw = readStoredValue(`${key}:scroll`, 0);
    const y = Number(raw) || 0;
    if (y > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: y, left: 0 }));
      window.setTimeout(() => window.scrollTo({ top: y, left: 0 }), 250);
      window.setTimeout(() => window.scrollTo({ top: y, left: 0 }), 750);
    }

    return undefined;
  }, [key, restoreWhen]);

  useEffect(() => {
    return () => {
      try {
        window.sessionStorage.setItem(`${key}:scroll`, JSON.stringify(window.scrollY || 0));
      } catch {
        // Session persistence is nice-to-have; ignore unavailable storage.
      }
    };
  }, [key]);
}
