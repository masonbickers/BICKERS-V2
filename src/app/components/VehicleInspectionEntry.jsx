"use client";

import { useState } from "react";
import { Button, Modal } from "./ui";
import MaintenanceBookingForm from "./MaintenanceBookingForm";
import DashboardMaintenanceModal from "./DashboardMaintenanceModal";
import { vehicleInspectionEntries } from "../utils/vehicleInspectionEntries";
import { normalizeMaintenanceRecord } from "../utils/maintenanceRecord";

const displayDate = (date) => date ? date.split("-").reverse().join("/") : "Date not set";

export default function VehicleInspectionEntry({ vehicleId, bookings, defaultDate, onClose }) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);
  const entries = vehicleInspectionEntries(bookings, vehicleId, defaultDate);

  if (selected) {
    return <DashboardMaintenanceModal
      event={{ ...selected, vehicleId, kind: "INSPECTION", __collection: "maintenanceBookings", __parentId: selected.id,
        maintenanceTypeIds: normalizeMaintenanceRecord(selected, { id: selected.id }).items.map((item) => item.maintenanceTypeId),
      }}
      onClose={onClose}
    />;
  }
  if (adding) {
    return <MaintenanceBookingForm
      vehicleId={vehicleId}
      type="INSPECTION"
      defaultDate={defaultDate}
      defaultMaintenanceTypeIds={["pmi", "brake_test"]}
      onClose={() => setAdding(false)}
      onSaved={(booking) => setSelected(booking)}
    />;
  }
  return <Modal
    open
    title="Record completed inspections"
    description="Open the inspection to enter its actual completion date and upload the PMI and brake-test documents. Completed records can be opened to review their evidence."
    onClose={onClose}
    footer={<>
      <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={() => setAdding(true)}>Add inspection</Button>
    </>}
  >
    <p>If the inspection is missing, add its appointment details, then enter the completion date on the next screen. An inspection completed before the current VOR period does not authorise a return to fleet.</p>
    {entries.length ? entries.map(({ booking, items, date, status }) => (
      <p key={booking.id}>
        <Button type="button" variant="secondary" onClick={() => setSelected(booking)}>
          {items.map((item) => item.maintenanceTypeId === "pmi" ? "PMI" : "Brake test").join(" + ")} · {displayDate(date)} · {status === "completed" ? "Completed — view record" : "Open inspection"}
        </Button>
      </p>
    )) : <p>No PMI or brake-test inspection records found.</p>}
  </Modal>;
}
