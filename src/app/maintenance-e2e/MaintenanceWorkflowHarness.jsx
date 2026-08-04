"use client";

import { useState } from "react";
import MaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";

const workflows = [
  { type: "MOT", label: "MOT workflow" },
  { type: "SERVICE", label: "Service workflow" },
  { type: "INSPECTION", label: "Combined PMI/brake workflow" },
];

export default function MaintenanceWorkflowHarness() {
  const [type, setType] = useState(null);
  const [saved, setSaved] = useState(null);

  const selectWorkflow = (nextType) => {
    setSaved(null);
    setType(nextType);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#eef2f7", padding: 24 }}>
      <h1>Maintenance workflow browser verification</h1>
      <nav aria-label="Maintenance workflow selector" style={{ display: "flex", gap: 8 }}>
        {workflows.map((workflow) => (
          <button key={workflow.type} type="button" onClick={() => selectWorkflow(workflow.type)}>
            {workflow.label}
          </button>
        ))}
      </nav>
      {saved ? (
        <section aria-label="Saved maintenance payload">
          <h2>Booking captured</h2>
          <pre data-testid="saved-maintenance-payload">{JSON.stringify(saved, null, 2)}</pre>
          <button type="button" onClick={() => setSaved(null)}>Book another</button>
        </section>
      ) : type ? (
        <MaintenanceBookingForm
          key={type}
          vehicleId="browser-test-vehicle"
          type={type}
          defaultDate="2026-08-12"
          defaultMaintenanceTypeIds={["pmi", "brake_test"]}
          saveBooking={async (payload) => ({ id: `browser-${type.toLowerCase()}`, ...payload })}
          onSaved={setSaved}
        />
      ) : <p>Select a workflow to begin.</p>}
    </main>
  );
}
