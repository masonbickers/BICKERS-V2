"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { DEFAULT_CONTENT_LABELS, formatContentLabel, normalizeContentLabels } from "@/app/utils/contentLabels";

const ContentLabelsContext = createContext({ labels: DEFAULT_CONTENT_LABELS, label: (key) => DEFAULT_CONTENT_LABELS[key] || key });

export default function ContentLabelsProvider({ children }) {
  const appearance = useAppearance();
  const labels = useMemo(() => normalizeContentLabels(appearance.labels), [appearance.labels]);
  const label = useCallback((key, values) => formatContentLabel(labels, key, values), [labels]);
  const value = useMemo(() => ({ labels, label, version: appearance.labelsVersion }), [appearance.labelsVersion, label, labels]);
  return <ContentLabelsContext.Provider value={value}>{children}</ContentLabelsContext.Provider>;
}

export function useContentLabels() {
  return useContext(ContentLabelsContext);
}
