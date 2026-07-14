"use client";

import dynamic from "next/dynamic";

const ClientAppShell = dynamic(() => import("./ClientAppShell"), {
  ssr: false,
  loading: () => <div style={{ padding: 20 }}>Loading secure workspace...</div>,
});

export default function LazyClientAppShell({ children }) {
  return <ClientAppShell>{children}</ClientAppShell>;
}
