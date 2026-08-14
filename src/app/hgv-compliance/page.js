"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePause,
  Clock3,
  GripVertical,
  Search,
  Truck,
} from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DashboardMaintenanceModal from "@/app/components/DashboardMaintenanceModal";
import VorPeriodDetailsModal from "@/app/components/VorPeriodDetailsModal";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { normalizeAssetRecord } from "@/app/utils/maintenanceSchema";
import {
  getImportedPlannerYear,
  HGV_EXCEL_REGISTRATION_ORDER,
  HGV_PLANNER_YEARS,
} from "./hgvPlannerData";
import {
  buildCompletedInspectionDates,
  buildPlannerInspectionEvidenceDates,
  buildLivePlannerEvents,
  buildPlannerMaintenanceModalEvent,
  applyPlannerRegistrationOrder,
  formatDate,
  getIsoWeekParts,
  hgvComplianceStatusForIsoWeek,
  isImportedPlannerEventHidden,
  isComplianceVorStartingInIsoWeek,
  isReturnInspectionScheduledForIsoWeek,
  isVorPeriodStartingInIsoWeek,
  reconcileImportedPlannerEvents,
  normalizeRegistration,
  orderPlannerRegistrations,
  orderPlannerRegistrationsByFleet,
  resolveVehicleLabel,
  resolveVehicleRegistration,
  summarizeInspectionRequirements,
  vehicleStatus,
  vorHistoryPeriodsForIsoWeek,
  weeksInIsoYear,
} from "./hgvPlanner";
import styles from "./page.module.css";
import { isHgvComplianceVehicle } from "../utils/hgvCompliance";

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const PDF_HISTORY_CUTOFF = "2026-07-31";
const VEHICLE_ORDER_STORAGE_KEY = "hgv-compliance:vehicle-order:v1";
const IMPORTED_CADENCE_EVENTS = HGV_PLANNER_YEARS.flatMap(
  (plannerYear) => getImportedPlannerYear(plannerYear).events
).filter((event) => event.type === "imported");

const eventLabel = {
  imported: "Imported planner",
  imported_vor: "Imported VOR marker",
  inspection: "Inspection",
  inspection_brake: "PMI + brake test",
  brake: "Brake test",
  mot: "MOT",
  service: "Service",
};

const eventTone = (event) => {
  if (event.type === "imported_vor") return styles.vorMarker;
  if (event.status === "requested") return styles.requested;
  if (event.status === "deferred") return styles.deferred;
  if (event.type === "inspection_brake") {
    return event.status === "completed"
      ? styles.completed
      : event.status === "booked"
        ? styles.booked
        : styles.due;
  }
  if (event.type === "mot") return styles.mot;
  if (event.type === "service") return styles.service;
  if (event.type === "brake") return styles.brake;
  if (event.status === "completed") return styles.completed;
  if (event.status === "booked") return styles.booked;
  if (event.status === "due") return styles.due;
  if (event.status === "projected") return styles.projected;
  if (event.type === "imported") {
    return event.date > PDF_HISTORY_CUTOFF ? styles.sourceDue : styles.sourceHistory;
  }
  return styles.imported;
};

const statusTone = (status) => {
  if (status === "ACTIVE" || status === "AVAILABLE") return styles.statusActive;
  if (status === "VOR") return styles.statusVor;
  return styles.statusOffFleet;
};

const assetTone = (registration) =>
  /^C\d/i.test(registration) ? styles.trailerHeader : styles.unitHeader;

export default function HgvCompliancePage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [search, setSearch] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);
  const [selectedVorPeriod, setSelectedVorPeriod] = useState(null);
  const [manualVehicleOrder, setManualVehicleOrder] = useState([]);
  const [expandedYears, setExpandedYears] = useState(
    () => new Set(HGV_PLANNER_YEARS.filter((plannerYear) => plannerYear >= CURRENT_YEAR))
  );
  const hasPositionedInitialYear = useRef(false);

  useEffect(() => {
    try {
      const savedOrder = JSON.parse(window.localStorage.getItem(VEHICLE_ORDER_STORAGE_KEY) || "[]");
      if (Array.isArray(savedOrder)) {
        setManualVehicleOrder(savedOrder.map(normalizeRegistration).filter(Boolean));
      }
    } catch {
      // Ignore unavailable or malformed device-local preferences.
    }
  }, []);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "vehicles",
        operation: "load HGV compliance planner",
      });
      setLoading(false);
      setDataError(gate.reason || "You do not have access to fleet compliance data.");
      return undefined;
    }

    setLoading(true);
    setDataError("");
    let vehiclesReady = false;
    let bookingsReady = false;
    const finish = () => {
      if (vehiclesReady && bookingsReady) setLoading(false);
    };

    const unsubscribeVehicles = onSnapshot(
      tenantCollectionQuery(db, "vehicles", dataAccessState),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        setVehicles(
          snapshot.docs.map((item) =>
            normalizeAssetRecord({ id: item.id, ...(item.data() || {}) })
          )
        );
        vehiclesReady = true;
        finish();
      },
      (error) => {
        handleFirestoreAccessError(error, {
          collectionName: "vehicles",
          operation: "listen to HGV vehicles",
        });
        setDataError("Vehicle data could not be loaded.");
        vehiclesReady = true;
        finish();
      }
    );

    const unsubscribeBookings = onSnapshot(
      tenantCollectionQuery(db, "maintenanceBookings", dataAccessState),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        setBookings(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })));
        bookingsReady = true;
        finish();
      },
      (error) => {
        handleFirestoreAccessError(error, {
          collectionName: "maintenanceBookings",
          operation: "listen to HGV inspections",
        });
        setDataError("Inspection bookings could not be loaded.");
        bookingsReady = true;
        finish();
      }
    );

    return () => {
      unsubscribeVehicles();
      unsubscribeBookings();
    };
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    if (loading || hasPositionedInitialYear.current) return;
    hasPositionedInitialYear.current = true;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`planner-${CURRENT_YEAR}`)
        ?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  const vehicleByRegistration = useMemo(() => {
    const map = new Map();
    vehicles.forEach((vehicle) => {
      const registration = resolveVehicleRegistration(vehicle);
      if (registration) map.set(registration, vehicle);
    });
    return map;
  }, [vehicles]);

  const openPlannerEntry = (event) => {
    const bookingId = String(event?.bookingId || "").trim();
    const vehicle = vehicleByRegistration.get(event?.registration) || null;
    const booking = bookingId
      ? bookings.find((item) => String(item.id || "") === bookingId) || null
      : null;
    setSelectedMaintenanceEvent(
      buildPlannerMaintenanceModalEvent({ event, vehicle, booking })
    );
  };

  const openLinkedBooking = (bookingId) => {
    const booking = bookings.find((item) => String(item.id || "") === String(bookingId || ""));
    if (!booking) return;
    const registration = normalizeRegistration(
      booking.registration ||
        booking.vehicleRegistration ||
        selectedMaintenanceEvent?.registration
    );
    const vehicle =
      vehicleByRegistration.get(registration) ||
      vehicles.find((item) => String(item.id || "") === String(booking.vehicleId || "")) ||
      null;
    setSelectedMaintenanceEvent(
      buildPlannerMaintenanceModalEvent({
        event: {
          ...(selectedMaintenanceEvent || {}),
          bookingId: booking.id,
          registration: registration || selectedMaintenanceEvent?.registration,
          status: booking.status || "Booked",
          isLegalDueReference: false,
          linkedBookingId: "",
        },
        vehicle,
        booking,
      })
    );
  };

  const selectedVorDetails = useMemo(() => {
    if (!selectedVorPeriod) return null;
    const vehicle = vehicles.find(
      (item) => String(item.id || "") === String(selectedVorPeriod.vehicleId || "")
    );
    const period = (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : []).find(
      (item) => String(item?.id || "") === String(selectedVorPeriod.periodId || "")
    );
    return vehicle && period ? { vehicle, period } : null;
  }, [selectedVorPeriod, vehicles]);

  const completedInspectionDatesByRegistration = useMemo(() => {
    const registrations = [
      ...new Set(
        [
          ...HGV_PLANNER_YEARS.flatMap(
            (plannerYear) => getImportedPlannerYear(plannerYear).registrations
          ),
          ...vehicles
            .filter(isHgvComplianceVehicle)
            .map(resolveVehicleRegistration)
            .filter(Boolean),
        ]
      ),
    ];
    const datesByRegistration = buildCompletedInspectionDates({
      vehicles,
      bookings,
      registrations,
    });

    HGV_PLANNER_YEARS.forEach((plannerYear) => {
      getImportedPlannerYear(plannerYear).events.forEach((event) => {
        if (event.type !== "imported" || event.date > PDF_HISTORY_CUTOFF) return;
        if (isImportedPlannerEventHidden(vehicleByRegistration.get(event.registration), event)) return;
        datesByRegistration.set(
          event.registration,
          [
            ...new Set([
              ...(datesByRegistration.get(event.registration) || []),
              event.date,
            ]),
          ].sort()
        );
      });
    });

    return datesByRegistration;
  }, [bookings, vehicleByRegistration, vehicles]);

  const currentWeek = useMemo(() => getIsoWeekParts(new Date()), []);

  const plannerYears = useMemo(() => {
    const term = normalizeRegistration(search);
    return HGV_PLANNER_YEARS.map((plannerYear) => {
      const imported = getImportedPlannerYear(plannerYear);
      const liveRegistrations = vehicles
        .filter(isHgvComplianceVehicle)
        .map(resolveVehicleRegistration)
        .filter(Boolean);
      const basePlannerRegistrations =
        plannerYear >= CURRENT_YEAR
          ? orderPlannerRegistrations(liveRegistrations, HGV_EXCEL_REGISTRATION_ORDER)
          : imported.registrations;
      const sortStatuses = new Map(
        basePlannerRegistrations.map((registration) => {
          const vehicle = vehicleByRegistration.get(registration);
          const completionDates = completedInspectionDatesByRegistration.get(registration) || [];
          const baseStatus = vehicleStatus(vehicle, imported.statuses[registration]);
          const complianceStatus = currentWeek
            ? hgvComplianceStatusForIsoWeek(
                vehicle,
                baseStatus,
                currentWeek.year,
                currentWeek.week,
                false,
                completionDates
              )
            : "";
          const returnInspectionThisWeek = currentWeek
            ? isReturnInspectionScheduledForIsoWeek(
                vehicle,
                currentWeek.year,
                currentWeek.week
              )
            : false;
          return [
            registration,
            complianceStatus === "VOR"
              ? "VOR"
              : baseStatus === "VOR" && returnInspectionThisWeek
                ? "ACTIVE"
                : baseStatus,
          ];
        })
      );
      const automaticPlannerRegistrations = plannerYear >= CURRENT_YEAR
        ? orderPlannerRegistrationsByFleet(
            basePlannerRegistrations,
            vehicleByRegistration,
            sortStatuses,
            HGV_EXCEL_REGISTRATION_ORDER
          )
        : basePlannerRegistrations;
      const plannerRegistrations = applyPlannerRegistrationOrder(
        automaticPlannerRegistrations,
        manualVehicleOrder
      );
      const visibleRegistrations = plannerRegistrations.filter((registration) => {
        if (!term) return true;
        const vehicle = vehicleByRegistration.get(registration);
        return (
          registration.includes(term) ||
          normalizeRegistration(resolveVehicleLabel(vehicle, registration)).includes(term)
        );
      });
      const liveEvents = buildLivePlannerEvents({
        vehicles,
        bookings,
        year: plannerYear,
        registrations: plannerRegistrations,
      });
      const eventsByCell = new Map();
      const importedCandidates = imported.events.filter(
        (event) => event.type !== "imported" || event.date <= PDF_HISTORY_CUTOFF
      );
      const importedReconciliation = reconcileImportedPlannerEvents({
        importedEvents: importedCandidates,
        canonicalEvents: liveEvents,
        cadenceEvents: IMPORTED_CADENCE_EVENTS,
        vehicles,
      });
      const historicalImportedEvents = [
        ...importedReconciliation.unmatched,
        ...importedReconciliation.inferred.map((item) => item.event),
        ...importedReconciliation.ambiguous.map((item) => item.event),
      ];
      const plannerInspectionDatesByRegistration = buildPlannerInspectionEvidenceDates(
        completedInspectionDatesByRegistration,
        [
          ...importedReconciliation.unmatched,
          ...importedReconciliation.inferred.map((item) => item.event),
        ]
      );
      [...historicalImportedEvents, ...liveEvents].forEach((event) => {
        if (!visibleRegistrations.includes(event.registration)) return;
        const key = `${event.week}|${event.registration}`;
        eventsByCell.set(key, [...(eventsByCell.get(key) || []), event]);
      });
      eventsByCell.forEach((cellEvents, key) => {
        const sourceEvents = cellEvents.some((event) => event.type !== "imported")
          ? cellEvents.filter((event) => event.type !== "imported")
          : cellEvents;
        const liveTypes = new Set(
          sourceEvents.map((event) => event.type)
        );
        if (liveTypes.has("inspection") && liveTypes.has("brake")) {
          const inspectionEvents = sourceEvents.filter(
            (event) => event.type === "inspection"
          );
          const brakeEvents = sourceEvents.filter((event) => event.type === "brake");
          const inspectionEvent = inspectionEvents.find((inspection) =>
            brakeEvents.some(
              (brake) =>
                (inspection.bookingId &&
                  brake.bookingId &&
                  inspection.bookingId === brake.bookingId) ||
                (!inspection.bookingId &&
                  !brake.bookingId &&
                  inspection.date === brake.date &&
                  inspection.status === brake.status)
            )
          );
          const brakeEvent = inspectionEvent
            ? brakeEvents.find(
                (brake) =>
                  (inspectionEvent.bookingId &&
                    brake.bookingId === inspectionEvent.bookingId) ||
                  (!inspectionEvent.bookingId &&
                    !brake.bookingId &&
                    inspectionEvent.date === brake.date &&
                    inspectionEvent.status === brake.status)
              )
            : null;
          if (!inspectionEvent || !brakeEvent) {
            eventsByCell.set(key, sourceEvents);
            return;
          }
          const pairedEvents = [inspectionEvent, brakeEvent];
          const allCompleted = pairedEvents.every((event) => event.status === "completed");
          const allBooked = pairedEvents.every((event) => event.status === "booked");
          const allRequested = pairedEvents.every((event) => event.status === "requested");
          const allDeferred = pairedEvents.every((event) => event.status === "deferred");
          const allDue = pairedEvents.every((event) => event.status === "due");
          const dates = [...new Set(pairedEvents.map((event) => event.date).filter(Boolean))];
          const pairedSources = [
            ...new Set(pairedEvents.map((event) => event.source).filter(Boolean)),
          ];
          const replacementEvent = {
            id: `system-pmi-brake-${key}`,
            type: "inspection_brake",
            status: allCompleted
              ? "completed"
              : allBooked
                ? "booked"
                : allRequested
                  ? "requested"
                : allDeferred
                  ? "deferred"
                  : allDue
                    ? "due"
                    : "planned",
            date: inspectionEvent.date || brakeEvent.date,
            registration: pairedEvents[0]?.registration,
            bookingId: inspectionEvent.bookingId || brakeEvent.bookingId || "",
            requirementKey: inspectionEvent.requirementKey || brakeEvent.requirementKey || "",
            legalDueDateISO: inspectionEvent.legalDueDateISO || brakeEvent.legalDueDateISO || "",
            appointmentDateISO: inspectionEvent.appointmentDateISO || brakeEvent.appointmentDateISO || "",
            isLegalDueReference: pairedEvents.every((event) => event.isLegalDueReference),
            linkedBookingId: inspectionEvent.linkedBookingId || brakeEvent.linkedBookingId || "",
            source: pairedSources.length === 1 ? pairedSources[0] : "",
            week: pairedEvents[0]?.week,
            label: `PMI + brake test ${
              allCompleted
                ? "completed"
                : allBooked
                  ? "booked"
                  : allRequested
                    ? "due — not arranged"
                : allDeferred
                  ? "deferred"
                  : allDue
                    ? "legal due date"
                    : "planned"
            }${
              dates.length > 1
                ? ` (${dates.map((date) => formatDate(date)).join(" + ")})`
                : ""
            }`,
          };
          eventsByCell.set(
            key,
            [
              ...sourceEvents.filter(
                (event) =>
                  event !== inspectionEvent &&
                  event !== brakeEvent
              ),
              replacementEvent,
            ]
          );
        } else if (sourceEvents !== cellEvents) {
          eventsByCell.set(key, sourceEvents);
        }
      });
      const displayedStatuses = visibleRegistrations.map((registration) => {
        const vehicle = vehicleByRegistration.get(registration);
        const inspectionCompletionDates =
          plannerInspectionDatesByRegistration.get(registration) || [];
        const baseStatus =
          plannerYear < CURRENT_YEAR
            ? imported.statuses[registration] || "AVAILABLE"
            : vehicleStatus(vehicle, imported.statuses[registration]);
        const complianceStatus =
          plannerYear >= CURRENT_YEAR && currentWeek
            ? hgvComplianceStatusForIsoWeek(
                vehicle,
                baseStatus,
                currentWeek.year,
                currentWeek.week,
                false,
                inspectionCompletionDates
              )
            : "";
        const returnInspectionThisWeek =
          plannerYear >= CURRENT_YEAR && currentWeek
            ? isReturnInspectionScheduledForIsoWeek(
                vehicle,
                currentWeek.year,
                currentWeek.week
              )
            : false;
        return {
          registration,
          vehicle,
          inspectionCompletionDates,
          currentStatus: baseStatus,
          status:
            plannerYear >= CURRENT_YEAR
              ? complianceStatus === "VOR"
                ? "VOR"
                : baseStatus === "VOR" &&
                    (inspectionCompletionDates.length || returnInspectionThisWeek)
                  ? "ACTIVE"
                  : baseStatus
              : baseStatus,
        };
      });
      return {
        year: plannerYear,
        imported,
        importedEntryCount:
          importedReconciliation.unmatched.length + importedReconciliation.ambiguous.length,
        inferredPmiCount: importedReconciliation.inferred.length,
        importedReconciliation,
        visibleRegistrations,
        liveEvents,
        eventsByCell,
        displayedStatuses,
        plannerRegistrations,
        weeks: Array.from({ length: weeksInIsoYear(plannerYear) }, (_, index) => index + 1),
        sourceWarnings: historicalImportedEvents.filter(
          (event) => Number(event.date.slice(0, 4)) !== plannerYear
        ).length,
      };
    });
  }, [
    bookings,
    completedInspectionDatesByRegistration,
    currentWeek,
    manualVehicleOrder,
    search,
    vehicleByRegistration,
    vehicles,
  ]);

  const currentPlanner =
    plannerYears.find((item) => item.year === CURRENT_YEAR) ||
    plannerYears[plannerYears.length - 1];
  const activeCount = currentPlanner?.displayedStatuses.filter((item) => item.status === "ACTIVE").length || 0;
  const vorCount = currentPlanner?.displayedStatuses.filter((item) => item.status === "VOR").length || 0;
  const unmatchedCount = currentPlanner?.displayedStatuses.filter((item) => !item.vehicle).length || 0;
  const inspectionSummary = summarizeInspectionRequirements(currentPlanner?.liveEvents || [], TODAY);
  const overdueCount = inspectionSummary.overdue;
  const dueSoonCount = inspectionSummary.dueSoon;
  const openVehicle = (registration) => {
    const vehicle = vehicleByRegistration.get(registration);
    if (vehicle?.id) router.push(`/vehicle-edit/${encodeURIComponent(vehicle.id)}`);
  };

  const reorderVehicles = (draggedRegistration, targetRegistration, displayedOrder) => {
    const dragged = normalizeRegistration(draggedRegistration);
    const target = normalizeRegistration(targetRegistration);
    if (!dragged || !target || dragged === target) return;

    const baseOrder = applyPlannerRegistrationOrder(
      [...manualVehicleOrder, ...(Array.isArray(displayedOrder) ? displayedOrder : [])],
      manualVehicleOrder
    );
    const fromIndex = baseOrder.indexOf(dragged);
    const targetIndex = baseOrder.indexOf(target);
    if (fromIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...baseOrder];
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(targetIndex, 0, dragged);
    setManualVehicleOrder(nextOrder);
    try {
      window.localStorage.setItem(VEHICLE_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    } catch {
      // The reordered view still works for this session when storage is unavailable.
    }
  };

  const toggleYear = (plannerYear) => {
    setExpandedYears((current) => {
      const next = new Set(current);
      if (next.has(plannerYear)) next.delete(plannerYear);
      else next.add(plannerYear);
      return next;
    });
  };

  const previousYears = HGV_PLANNER_YEARS.filter((plannerYear) => plannerYear < CURRENT_YEAR);
  const allPreviousYearsExpanded = previousYears.every((plannerYear) =>
    expandedYears.has(plannerYear)
  );
  const togglePreviousYears = () => {
    setExpandedYears((current) => {
      const next = new Set(current);
      previousYears.forEach((plannerYear) => {
        if (allPreviousYearsExpanded) next.delete(plannerYear);
        else next.add(plannerYear);
      });
      return next;
    });
  };

  return (
    <HeaderSidebarLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Fleet compliance</div>
            <h1>HGV Inspection Planner</h1>
            <p>
              Canonical PMI, brake-test, MOT and service requirements with live Active/VOR status in one ISO-week view.
            </p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => router.push("/vehicle-home")}>
            <ArrowLeft size={16} /> Vehicle Management
          </button>
        </header>

        {dataError ? <div className={styles.errorBanner}>{dataError}</div> : null}

        <section className={styles.summaryGrid}>
          <Summary label="HGVs on planner" value={currentPlanner?.visibleRegistrations.length || 0} detail={`${unmatchedCount} PDF-only records`} icon={Truck} />
          <Summary label="Active" value={activeCount} detail="Live fleet status" icon={CheckCircle2} tone="green" />
          <Summary label="VOR" value={vorCount} detail="Schedules paused" icon={CirclePause} tone={vorCount ? "red" : "green"} />
          <Summary label="Due in 8 weeks" value={dueSoonCount} detail={`${overdueCount} overdue`} icon={Clock3} tone={overdueCount ? "red" : "amber"} />
        </section>

        <section className={styles.controls}>
          <div>
            <h2>Inspection, Brake Test, MOT & Service Planner</h2>
            <p>The current year opens automatically; previous years remain available in collapsible sections.</p>
          </div>
          <div className={styles.controlFields}>
            <label>
              <span>Find vehicle</span>
              <div className={styles.search}>
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Registration or vehicle"
                />
              </div>
            </label>
          </div>
        </section>

        <div className={styles.legend} aria-label="Planner key">
          <span className={styles.legendTitle}>Status</span>
          <Legend className={styles.keyAvailable} label="Available" />
          <Legend className={styles.keyVor} label="VOR" />
          <Legend className={styles.keyOffFleet} label="Off fleet" />
          <span className={styles.legendTitle}>Vehicle</span>
          <Legend className={styles.keyUnit} label="Unit" />
          <Legend className={styles.keyTrailer} label="Trailer" />
          <span className={styles.legendTitle}>Planner</span>
          <Legend className={styles.sourceHistory} label="Historic / completed" />
          <Legend className={styles.requested} label="Due — not arranged" />
          <Legend className={styles.booked} label="Booked" />
          <Legend className={styles.deferred} label="Deferred" />
          <Legend className={styles.brake} label="Brake test" />
          <Legend className={styles.mot} label="MOT" />
          <Legend className={styles.service} label="Service" />
        </div>

        <nav className={styles.yearNav} aria-label="Jump to planner year">
          <span>Jump to</span>
          {HGV_PLANNER_YEARS.map((plannerYear) => (
            <a
              key={plannerYear}
              href={`#planner-${plannerYear}`}
              className={plannerYear === CURRENT_YEAR ? styles.currentYearLink : undefined}
            >
              {plannerYear}
            </a>
          ))}
          {previousYears.length ? (
            <button type="button" onClick={togglePreviousYears}>
              {allPreviousYearsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {allPreviousYearsExpanded ? "Collapse previous" : "Expand previous"}
            </button>
          ) : null}
        </nav>

        {loading ? (
          <section className={styles.plannerCard}>
            <div className={styles.loading}>Loading live fleet compliance data…</div>
          </section>
        ) : (
          <div className={styles.yearStack}>
            {plannerYears.map((planner) => {
              const isPreviousYear = planner.year < CURRENT_YEAR;
              const isExpanded = expandedYears.has(planner.year);

              return (
                <section
                  key={planner.year}
                  id={`planner-${planner.year}`}
                  className={`${styles.yearSection} ${planner.year === CURRENT_YEAR ? styles.currentYearSection : ""} ${!isExpanded ? styles.collapsedYearSection : ""}`}
                >
                  <div className={styles.yearHeading}>
                    <div>
                      {isPreviousYear ? (
                        <button
                          type="button"
                          className={styles.yearToggle}
                          onClick={() => toggleYear(planner.year)}
                          aria-expanded={isExpanded}
                          aria-controls={`planner-body-${planner.year}`}
                        >
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                          <span className={styles.srOnly}>
                            {isExpanded ? "Collapse" : "Expand"} {planner.year}
                          </span>
                        </button>
                      ) : null}
                      <span>Annual schedule</span>
                      <h3>{planner.year}</h3>
                    </div>
                    <div className={styles.yearHeadingMeta}>
                      <strong>
                        {planner.visibleRegistrations.length} vehicles ·{" "}
                        {planner.importedEntryCount} unmatched imported entries
                        {planner.inferredPmiCount
                          ? ` · ${planner.inferredPmiCount} cadence-inferred PMI${planner.inferredPmiCount === 1 ? "" : "s"}`
                          : ""}
                      </strong>
                      {isPreviousYear ? (
                        <button type="button" onClick={() => toggleYear(planner.year)}>
                          {isExpanded ? "Hide year" : "Show year"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isExpanded ? (
                    <div id={`planner-body-${planner.year}`}>
                      {planner.sourceWarnings ? (
                        <div className={styles.sourceWarning}>
                          <AlertTriangle size={15} />
                          {planner.sourceWarnings} imported{" "}
                          {planner.sourceWarnings === 1 ? "entry has" : "entries have"} a
                          printed date outside {planner.year}. It is shown unchanged for audit.
                        </div>
                      ) : null}
                      {planner.importedReconciliation.ambiguous.length ? (
                        <details className={styles.reconciliationWarning}>
                          <summary>
                            <AlertTriangle size={15} />
                            {planner.importedReconciliation.ambiguous.length} imported {planner.importedReconciliation.ambiguous.length === 1 ? "entry needs" : "entries need"} review
                          </summary>
                          <ul>
                            {planner.importedReconciliation.ambiguous.map(({ event, matches }) => (
                              <li key={event.id || `${event.registration}-${event.week}-${event.date}`}>
                                {event.registration} · W{event.week} · {formatDate(event.date)} — matches {matches.length} canonical records
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <div className={styles.plannerCard}>
                        {planner.visibleRegistrations.length ? (
                          <PlannerTable
                            planner={planner}
                            currentWeek={currentWeek}
                            openVehicle={openVehicle}
                            openPlannerEntry={openPlannerEntry}
                            reorderVehicles={reorderVehicles}
                            openVorPeriod={(vehicle, period) =>
                              setSelectedVorPeriod({ vehicleId: vehicle.id, periodId: period.id })
                            }
                          />
                        ) : (
                          <div className={styles.empty}>
                            No planner vehicles match “{search}”.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}

        <footer className={styles.sourceNote}>
          <CalendarDays size={15} />
          Imported dates through 31/07/2026 remain visible when unmatched. Entries represented by
          canonical bookings or vehicle history are hidden, ambiguous matches are listed for review,
          and audited exclusions remain retained. When an MOT falls between two imported dates at an
          approximately eight-week interval, the planner retains a clearly labelled inferred PMI in the
          same ISO week. PMI and brake-test due dates are projected 12 months
          ahead from each vehicle&apos;s configured interval; saved appointments replace the matching due marker.
          MOT and service entries come from canonical requested requirements and active appointments.
        </footer>

        {selectedMaintenanceEvent ? (
          <DashboardMaintenanceModal
            event={selectedMaintenanceEvent}
            onClose={() => setSelectedMaintenanceEvent(null)}
            onOpenLinkedBooking={openLinkedBooking}
          />
        ) : null}

        {selectedVorDetails ? (
          <VorPeriodDetailsModal
            vehicle={selectedVorDetails.vehicle}
            period={selectedVorDetails.period}
            onClose={() => setSelectedVorPeriod(null)}
          />
        ) : null}
      </main>
    </HeaderSidebarLayout>
  );
}

function PlannerTable({
  planner,
  currentWeek,
  openVehicle,
  openPlannerEntry,
  openVorPeriod,
  reorderVehicles,
}) {
  const [draggedRegistration, setDraggedRegistration] = useState("");
  const [dragOverRegistration, setDragOverRegistration] = useState("");
  const statusByRegistration = new Map(
    planner.displayedStatuses.map(
      ({ registration, vehicle, status, currentStatus, inspectionCompletionDates }) => [
        registration,
        { vehicle, status, currentStatus, inspectionCompletionDates },
      ]
    )
  );

  return (
    <div className={styles.tableScroll}>
      <table className={styles.plannerTable}>
        <thead>
          <tr>
            <th className={styles.weekColumn}>ISO week</th>
            {planner.displayedStatuses.map(({ registration, vehicle, status }, index) => (
              <th
                key={registration}
                className={`${assetTone(registration)} ${draggedRegistration === registration ? styles.draggingColumn : ""} ${dragOverRegistration === registration ? styles.dragTargetColumn : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverRegistration(registration);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOverRegistration("");
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = draggedRegistration || event.dataTransfer.getData("text/plain");
                  reorderVehicles?.(source, registration, planner.plannerRegistrations);
                  setDraggedRegistration("");
                  setDragOverRegistration("");
                }}
              >
                <div className={styles.vehicleHeader}>
                  <button
                    type="button"
                    className={styles.dragHandle}
                    draggable
                    aria-label={`Drag ${registration} to reorder`}
                    title="Drag to reorder vehicle columns"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", registration);
                      setDraggedRegistration(registration);
                    }}
                    onDragEnd={() => {
                      setDraggedRegistration("");
                      setDragOverRegistration("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      const targetIndex = event.key === "ArrowLeft" ? index - 1 : index + 1;
                      const target = planner.displayedStatuses[targetIndex]?.registration;
                      if (target) reorderVehicles?.(registration, target, planner.plannerRegistrations);
                    }}
                  >
                    <GripVertical size={13} aria-hidden="true" />
                  </button>
                  <button
                  type="button"
                  className={styles.vehicleLink}
                  onClick={() => openVehicle(registration)}
                  disabled={!vehicle?.id}
                  title={vehicle?.id ? "Open vehicle record" : "No matching live vehicle record"}
                >
                  <strong>{registration}</strong>
                  <span className={`${styles.statusBadge} ${statusTone(status)}`}>{status}</span>
                  <small>{resolveVehicleLabel(vehicle, vehicle ? "" : "Imported record")}</small>
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {planner.weeks.map((week) => {
            const isCurrent = currentWeek?.year === planner.year && currentWeek.week === week;
            return (
              <tr key={week} className={isCurrent ? styles.currentWeek : undefined}>
                <th className={styles.weekColumn}>
                  <span>W{String(week).padStart(2, "0")}</span>
                  {isCurrent ? <small>Now</small> : null}
                </th>
                {planner.visibleRegistrations.map((registration) => {
                  const events = planner.eventsByCell.get(`${week}|${registration}`) || [];
                  const statusRecord = statusByRegistration.get(registration);
                  const vorPeriods = vorHistoryPeriodsForIsoWeek(
                    statusRecord?.vehicle,
                    planner.year,
                    week
                  );
                  const startingVorPeriods = vorPeriods.filter((period) =>
                    isVorPeriodStartingInIsoWeek(period, planner.year, week)
                  );
                  const operatingStatus = hgvComplianceStatusForIsoWeek(
                    statusRecord?.vehicle,
                    statusRecord?.currentStatus,
                    planner.year,
                    week,
                    planner.year < CURRENT_YEAR,
                    statusRecord?.inspectionCompletionDates || []
                  );
                  const automaticVorStarts =
                    startingVorPeriods.length === 0 &&
                    isComplianceVorStartingInIsoWeek(
                      statusRecord?.vehicle,
                      statusRecord?.currentStatus,
                      planner.year,
                      week,
                      statusRecord?.inspectionCompletionDates || []
                    );
                  return (
                    <td
                      key={registration}
                      className={
                        operatingStatus === "VOR"
                          ? `${styles.cellVor} ${startingVorPeriods.length || automaticVorStarts ? styles.cellVorStart : ""}`
                          : operatingStatus === "OFF FLEET"
                            ? styles.cellOffFleet
                            : undefined
                      }
                    >
                      <div className={styles.cellEvents}>
                        {startingVorPeriods.map((period) => (
                          <button
                            type="button"
                            key={`vor-${period.id || `${period.offRoadDate}-${period.returnedDate}`}`}
                            className={`${styles.eventChip} ${styles.vorMarker}`}
                            title={`VOR/SORN: ${formatDate(period.offRoadDate)} to ${period.returnedDate ? formatDate(period.returnedDate) : "Open"}`}
                            onClick={() => openVorPeriod(statusRecord.vehicle, period)}
                          >
                            VOR
                          </button>
                        ))}
                        {automaticVorStarts ? (
                          <button
                            type="button"
                            className={`${styles.eventChip} ${styles.vorMarker}`}
                            title="VOR — inspection remains outstanding after its legal ISO week"
                            onClick={() => openVehicle(registration)}
                          >
                            VOR
                          </button>
                        ) : null}
                        {events.map((event) => (
                          <button
                            type="button"
                            key={event.id || `${event.type}-${event.status}-${event.date}`}
                            className={`${styles.eventChip} ${eventTone(event)}`}
                            title={`${eventLabel[event.type] || event.type}: ${formatDate(event.date)}${event.label ? ` — ${event.label}` : ""}`}
                            onClick={() => openPlannerEntry(event)}
                          >
                            {formatDate(event.date)}
                            {[
                              "inspection",
                              "inspection_brake",
                              "brake",
                              "mot",
                              "service",
                            ].includes(event.type) ? (
                              <b>
                                {event.type === "inspection"
                                  ? "PMI"
                                  : event.type === "inspection_brake"
                                    ? "PMI+B"
                                  : event.type === "brake"
                                      ? "B"
                                      : event.type === "service"
                                        ? "SERVICE"
                                      : "MOT"}
                              </b>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <div className={`${styles.summary} ${styles[`summary_${tone}`] || ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <Icon size={21} />
    </div>
  );
}

function Legend({ className, label }) {
  return (
    <span><i className={className} />{label}</span>
  );
}
