"use client";

import { useEffect } from "react";

const CACHE_REFRESH_KEY = "bickers-app-cache-refresh-v1";

export default function AppCacheRefresh() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const refreshInstalledAppCache = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));

        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          const staleWorkboxCaches = cacheNames.filter((name) => /workbox|next|start-url|apis|others|cross-origin/i.test(name));
          await Promise.all(staleWorkboxCaches.map((name) => window.caches.delete(name).catch(() => false)));
        }

        if (!sessionStorage.getItem(CACHE_REFRESH_KEY) && navigator.serviceWorker.controller) {
          sessionStorage.setItem(CACHE_REFRESH_KEY, "done");
          window.location.reload();
        }
      } catch (error) {
        console.warn("App cache refresh skipped", error);
      }
    };

    refreshInstalledAppCache();
  }, []);

  return null;
}
