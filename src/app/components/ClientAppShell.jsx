"use client";

import { AuthProvider } from "@/app/context/authContext";
import ProtectedLayout from "@/app/components/ProtectedLayout";
import AppCacheRefresh from "@/app/components/AppCacheRefresh";

export default function ClientAppShell({ children }) {
  return (
    <AuthProvider>
      <AppCacheRefresh />
      <ProtectedLayout>{children}</ProtectedLayout>
    </AuthProvider>
  );
}
