"use client";

import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function TermsPage() {
  return (
    <HeaderSidebarLayout>
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "40px 20px",
          backgroundColor: "#1c1c1e",
          color: "#e5e5e5",
          borderRadius: "12px",
          boxShadow: "0 0 0 1px #333",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "20px", color: "#fff" }}>
          Terms & Policies
        </h1>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            1. Overview
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            Bickers Booking System is designed for managing bookings, vehicles, staff, and production logistics. Use of this system implies acceptance of these terms.
          </p>
        </section>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            2. Data Usage
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            We store booking, staff, and vehicle data, including uploaded documents. This data is only used within the platform and not shared externally.
          </p>
        </section>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            3. User Responsibility
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            Users must ensure all data entered is accurate and up to date. Misuse of the system may result in restricted access.
          </p>
        </section>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            4. Access and Permissions
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            Permissions are assigned by role. Admins can modify all fields. Staff should only use permitted features. Contact support for access queries.
          </p>
        </section>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            5. File Uploads
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            Uploads must relate directly to the booking or job. Irrelevant or inappropriate uploads may be removed and reviewed.
          </p>
        </section>

        <section style={{ marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "10px", color: "#f5f5f5" }}>
            6. Terms Updates
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#ccc" }}>
            Terms are subject to change. You will be notified of any updates. Continued use implies agreement to the latest terms.
          </p>
        </section>

        <p style={{ fontSize: "13px", marginTop: "40px", color: "#888" }}>
          Last updated: July 2025
        </p>
      </div>
    </HeaderSidebarLayout>
  );
}
