"use client";

import { useEffect } from "react";
import { themeSettingsToCssVariables } from "@/app/utils/themeSettings";

export const THEME_UPDATED_EVENT = "bickers-theme-updated";

function applyTheme(theme) {
  const root = document.documentElement;
  const variables = themeSettingsToCssVariables(theme);
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  root.dataset.themeLoaded = "true";
}

export default function GlobalThemeProvider() {
  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      try {
        const response = await fetch("/api/theme", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) applyTheme(data.theme);
      } catch (error) {
        console.warn("Global theme load skipped", error);
      }
    };

    const handleUpdate = (event) => applyTheme(event.detail);
    window.addEventListener(THEME_UPDATED_EVENT, handleUpdate);
    loadTheme();

    return () => {
      cancelled = true;
      window.removeEventListener(THEME_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  return null;
}
