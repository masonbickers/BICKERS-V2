"use client";

import { UserProfile } from "@clerk/nextjs";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function ChangePasswordPage() {
  return (
    <HeaderSidebarLayout>
      <main style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Account security</h1>
          <p style={styles.subtitle}>
            Manage your Clerk password, passkeys, connected accounts and active sessions.
          </p>
        </div>
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", maxWidth: "980px", boxShadow: "none" },
              card: { width: "100%", boxShadow: "none", border: "var(--border-default)" },
            },
          }}
        />
      </main>
    </HeaderSidebarLayout>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: "20px", background: "var(--color-canvas)" },
  header: { maxWidth: 980, marginBottom: "var(--space-4)" },
  title: { margin: 0, color: "var(--color-text)", fontSize: 24 },
  subtitle: { margin: "7px 0 0", color: "var(--color-text-muted)", fontSize: "var(--font-size-md)" },
};
