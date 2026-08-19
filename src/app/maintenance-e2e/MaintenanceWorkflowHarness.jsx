"use client";

import layoutStyles from "./MaintenanceWorkflowHarness.styles.module.css";
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
  const [arrangingDueItem, setArrangingDueItem] = useState(false);

  const selectWorkflow = (nextType) => {
    setSaved(null);
    setArrangingDueItem(false);
    setType(nextType);
  };

  return (
    <main className={layoutStyles.extracted1}>
      <h1>Maintenance workflow browser verification</h1>
      <nav aria-label="Maintenance workflow selector" className={layoutStyles.extracted2}>
        {workflows.map((workflow) => (
          <button key={workflow.type} type="button" onClick={() => selectWorkflow(workflow.type)}>
            {workflow.label}
          </button>
        ))}
        <button type="button" onClick={() => selectWorkflow("DUE_SERVICE")}>Requested due-item workflow</button>
      </nav>
      {saved ? (
        <section aria-label="Saved maintenance payload">
          <h2>{saved.requestedRecordId ? "Confirmed booking" : "Booking captured"}</h2>
          {saved.requestedRecordId ? (
            <dl>
              <dt>Workshop date</dt><dd>{saved.appointmentDate}</dd>
              <dt>Legal due date</dt><dd>{saved.sourceDueDate}</dd>
            </dl>
          ) : null}
          <pre data-testid="saved-maintenance-payload">{JSON.stringify(saved, null, 2)}</pre>
          <button type="button" onClick={() => setSaved(null)}>Book another</button>
        </section>
      ) : type === "DUE_SERVICE" && !arrangingDueItem ? (
        <section aria-label="Requested maintenance due item">
          <h2>Service</h2>
          <p>Due — not yet arranged</p>
          <p>Legal due date: 12 August 2026</p>
          <button type="button" onClick={() => setArrangingDueItem(true)}>Choose workshop date</button>
        </section>
      ) : type ? (
        <MaintenanceBookingForm
          key={type}
          vehicleId="browser-test-vehicle"
          type={type === "DUE_SERVICE" ? "SERVICE" : type}
          defaultDate={type === "DUE_SERVICE" ? "2026-08-10" : "2026-08-12"}
          sourceDueDate={type === "DUE_SERVICE" ? "2026-08-12" : ""}
          sourceDueIsoWeek={type === "DUE_SERVICE" ? "2026-W33" : ""}
          sourceDueKey={type === "DUE_SERVICE" ? "service-browser-test-vehicle-2026-08-12" : ""}
          requestedRecordId={type === "DUE_SERVICE" ? "req_service_browser" : ""}
          defaultMaintenanceTypeIds={["pmi", "brake_test"]}
          saveBooking={async (payload) => ({
            id: payload.requestedRecordId || `browser-${type.toLowerCase()}`,
            ...payload,
          })}
          onSaved={setSaved}
        />
      ) : <p>Select a workflow to begin.</p>}
    </main>
  );
}
