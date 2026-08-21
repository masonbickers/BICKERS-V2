"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/authContext";
import { DEFAULT_CONTENT_LABELS, normalizeContentLabels } from "@/app/utils/contentLabels";
import {
  applyGlobalTheme,
  cacheGlobalTheme,
  DEFAULT_GLOBAL_THEME,
  normalizeGlobalTheme,
  readCachedGlobalTheme,
  readColorModePreference,
  writeColorModePreference,
} from "@/app/utils/globalTheme";
import {
  applyInterfaceScale,
  readInterfaceScalePreference,
  writeInterfaceScalePreference,
} from "@/app/utils/interfaceScale";

export const GLOBAL_THEME_UPDATED_EVENT = "bickers:global-theme-updated";
export const APPEARANCE_UPDATED_EVENT = "bickers:appearance-updated";
const APPEARANCE_CACHE_PREFIX = "bickers-appearance:v1";
const BROWSER_CHROME_COLORS = {
  normal: "#000000",
  light: "#e7e7e7",
};

const AppearanceContext = createContext({
  companyId: "__platform__",
  theme: DEFAULT_GLOBAL_THEME,
  labels: DEFAULT_CONTENT_LABELS,
  themeVersion: 0,
  labelsVersion: 0,
  modePreference: "normal",
  resolvedMode: "normal",
  setModePreference: () => {},
  interfaceScale: "standard",
  setInterfaceScale: () => {},
  loading: true,
  refresh: async () => {},
});

const appearanceCacheKey = (companyId) => `${APPEARANCE_CACHE_PREFIX}:${companyId || "__platform__"}`;

function readAppearanceCache(companyId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(appearanceCacheKey(companyId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAppearanceCache(appearance) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(appearanceCacheKey(appearance.companyId), JSON.stringify(appearance));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory appearance still works.
  }
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

export default function GlobalThemeProvider({ children }) {
  const authAccess = useAuth() || {};
  const companyId = String(authAccess.userDoc?.companyId || "__platform__").trim() || "__platform__";
  const [appearance, setAppearance] = useState(() => ({
    companyId: "__platform__",
    theme: DEFAULT_GLOBAL_THEME,
    labels: DEFAULT_CONTENT_LABELS,
    themeVersion: 0,
    labelsVersion: 0,
  }));
  const [modePreference, setModePreferenceState] = useState("normal");
  const [interfaceScale, setInterfaceScaleState] = useState("standard");
  const [loading, setLoading] = useState(true);

  const applyAppearance = useCallback((incoming) => {
    const resolved = {
      companyId: incoming?.companyId || companyId || "__platform__",
      theme: normalizeGlobalTheme(incoming?.theme || DEFAULT_GLOBAL_THEME),
      labels: normalizeContentLabels(incoming?.labels || DEFAULT_CONTENT_LABELS),
      themeVersion: Number(incoming?.themeVersion || 0),
      labelsVersion: Number(incoming?.labelsVersion || 0),
    };
    setAppearance(resolved);
    cacheGlobalTheme(resolved.theme, resolved.companyId, resolved.themeVersion);
    writeAppearanceCache(resolved);
    return resolved;
  }, [companyId]);

  const refresh = useCallback(async () => {
    const authenticated = authAccess.user && authAccess.accessReady;
    const targetCompany = authenticated ? companyId : "__platform__";
    const cached = readAppearanceCache(targetCompany);
    if (cached) applyAppearance(cached);
    else {
      const cachedTheme = readCachedGlobalTheme(targetCompany);
      if (cachedTheme) applyAppearance({ companyId: targetCompany, theme: cachedTheme, labels: DEFAULT_CONTENT_LABELS });
    }
    try {
      const token = authenticated ? await authAccess.user.getIdToken?.() : "";
      const response = await fetch("/api/appearance", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) return;
      applyAppearance(await response.json());
    } catch {
      // Cached/default appearance remains active offline.
    } finally {
      setLoading(false);
    }
  }, [applyAppearance, authAccess.accessReady, authAccess.user, companyId]);

  useEffect(() => {
    setModePreferenceState(readColorModePreference());
    const savedInterfaceScale = readInterfaceScalePreference();
    setInterfaceScaleState(savedInterfaceScale);
    applyInterfaceScale(savedInterfaceScale);
  }, []);

  useEffect(() => {
    applyGlobalTheme(appearance.theme, { preference: modePreference });

    const browserChromeColor = modePreference === "dark"
      ? appearance.theme.darkShellColor
      : BROWSER_CHROME_COLORS[modePreference] || BROWSER_CHROME_COLORS.normal;
    let themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.setAttribute("name", "theme-color");
      document.head.appendChild(themeColor);
    }
    themeColor.setAttribute("content", browserChromeColor);

    let statusBarStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!statusBarStyle) {
      statusBarStyle = document.createElement("meta");
      statusBarStyle.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      document.head.appendChild(statusBarStyle);
    }
    statusBarStyle.setAttribute("content", modePreference === "light" ? "default" : "black-translucent");
  }, [appearance.theme, modePreference]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUpdate = (event) => {
      if (event?.detail?.theme || event?.detail?.labels) applyAppearance({ ...appearance, ...event.detail });
      else applyAppearance({ ...appearance, theme: event?.detail });
    };
    window.addEventListener(GLOBAL_THEME_UPDATED_EVENT, handleUpdate);
    window.addEventListener(APPEARANCE_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(GLOBAL_THEME_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(APPEARANCE_UPDATED_EVENT, handleUpdate);
    };
  }, [appearance, applyAppearance]);

  const setModePreference = useCallback((value) => {
    const next = writeColorModePreference(value);
    setModePreferenceState(next);
  }, []);

  const setInterfaceScale = useCallback((value) => {
    const next = writeInterfaceScalePreference(value);
    setInterfaceScaleState(next);
  }, []);

  const resolvedMode = modePreference;
  const contextValue = useMemo(
    () => ({
      ...appearance,
      modePreference,
      resolvedMode,
      setModePreference,
      interfaceScale,
      setInterfaceScale,
      loading,
      refresh,
    }),
    [appearance, interfaceScale, loading, modePreference, refresh, resolvedMode, setInterfaceScale, setModePreference]
  );
  return <AppearanceContext.Provider value={contextValue}>{children}</AppearanceContext.Provider>;
}
