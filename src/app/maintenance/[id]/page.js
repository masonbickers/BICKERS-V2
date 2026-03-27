"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import MaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";
import EditMaintenanceBookingForm from "@/app/components/EditMaintenanceBookingForm";

const pageWrap = {
  minHeight: "100%",
  padding: "24px 18px 40px",
  background: "#f8fafc",
};

const shell = {
  maxWidth: 1180,
  margin: "0 auto",
};

const heroCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#ffffff",
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: "18px 20px",
};

const eyebrow = {
  margin: 0,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontSize: 11,
  fontWeight: 800,
};

const heading = {
  margin: "8px 0 6px",
  color: "#0f172a",
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.02em",
};

const subtext = {
  margin: 0,
  color: "#475569",
  fontSize: 14,
  lineHeight: 1.5,
};

const backBtn = {
  marginTop: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

export default function MaintenanceRoutePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const bookingId = String(params?.id || "").trim();
  const isNew = bookingId === "new";
  const vehicleId = String(searchParams.get("vehicleId") || "").trim();
  const type = String(searchParams.get("type") || "MOT").trim().toUpperCase();
  const defaultDate = String(
    searchParams.get("date") || searchParams.get("defaultDate") || ""
  ).slice(0, 10);
  const sourceDueDate = String(searchParams.get("sourceDueDate") || defaultDate || "").slice(0, 10);
  const sourceDueIsoWeek = String(searchParams.get("sourceDueIsoWeek") || "").trim();
  const sourceDueKey = String(searchParams.get("sourceDueKey") || "").trim();

  const title = useMemo(
    () => (isNew ? "Create Maintenance Booking" : "Edit Maintenance Booking"),
    [isNew]
  );

  const helperText = isNew
    ? "This page now uses the shared maintenance booking workflow, matching dashboard and vehicle maintenance."
    : "This booking now opens through the shared maintenance editor, so edits stay aligned with dashboard and vehicle maintenance.";

  const handleDone = () => {
    router.push("/dashboard?updated=true");
  };

  const handleClose = () => {
    router.push("/dashboard");
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={shell}>
          <div style={heroCard}>
            <p style={eyebrow}>Maintenance</p>
            <h1 style={heading}>{title}</h1>
            <p style={subtext}>{helperText}</p>
            <button type="button" style={backBtn} onClick={handleClose}>
              Back to dashboard
            </button>
          </div>
        </div>

        {isNew ? (
          <MaintenanceBookingForm
            vehicleId={vehicleId}
            type={type || "MOT"}
            defaultDate={defaultDate}
            sourceDueDate={sourceDueDate}
            sourceDueIsoWeek={sourceDueIsoWeek}
            sourceDueKey={sourceDueKey}
            onClose={handleClose}
            onSaved={handleDone}
          />
        ) : (
          <EditMaintenanceBookingForm
            bookingId={bookingId}
            vehicleId={vehicleId}
            onClose={handleClose}
            onSaved={handleDone}
          />
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
