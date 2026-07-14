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
            Manage your Clerk password, connected accounts and active sessions.
          </p>
        </div>
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", maxWidth: "980px", boxShadow: "none" },
              card: { width: "100%", boxShadow: "none", border: "1px solid #d7dee8" },
            },
          }}
        />
      </main>
    </HeaderSidebarLayout>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: "20px", background: "#f3f6f9" },
  header: { maxWidth: 980, marginBottom: 16 },
  title: { margin: 0, color: "#0f172a", fontSize: 24 },
  subtitle: { margin: "7px 0 0", color: "#5f6f82", fontSize: 14 },
};
