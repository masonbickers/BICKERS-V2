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
  Search,
  Truck,
} from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DashboardMaintenanceModal from "@/app/components/DashboardMaintenanceModal";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { normalizeAssetRecord } from "@/app/utils/maintenanceSchema";
import { getImportedPlannerYear, HGV_PLANNER_YEARS } from "./hgvPlannerData";
import {
  buildCompletedInspectionDates,
  buildLivePlannerEvents,
  buildPlannerMaintenanceModalEvent,
  formatDate,
  getIsoWeekParts,
  hgvComplianceStatusForIsoWeek,
  normalizeRegistration,
  resolveVehicleLabel,
  resolveVehicleRegistration,
  vehicleStatus,
  weeksInIsoYear,
} from "./hgvPlanner";
import styles from "./page.module.css";
import { isHgvComplianceVehicle } from "../utils/hgvCompliance";

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const PDF_HISTORY_CUTOFF = "2026-07-31";

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

const daysFromToday = (value) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 12);
  return Math.round((date - today) / 86400000);
};

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
  const [expandedYears, setExpandedYears] = useState(
    () => new Set(HGV_PLANNER_YEARS.filter((plannerYear) => plannerYear >= CURRENT_YEAR))
  );
  const hasPositionedInitialYear = useRef(false);

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
      (snapshot) => {
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
      (snapshot) => {
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
  }, [bookings, vehicles]);

  const currentWeek = useMemo(() => getIsoWeekParts(new Date()), []);

  const plannerYears = useMemo(() => {
    const term = normalizeRegistration(search);
    return HGV_PLANNER_YEARS.map((plannerYear) => {
      const imported = getImportedPlannerYear(plannerYear);
      const liveRegistrations = vehicles
        .filter(isHgvComplianceVehicle)
        .map(resolveVehicleRegistration)
        .filter(Boolean);
      const plannerRegistrations =
        plannerYear >= CURRENT_YEAR
          ? [...new Set(liveRegistrations)]
          : imported.registrations;
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
      const historicalImportedEvents = imported.events.filter(
        (event) =>
          event.type !== "imported" ||
          event.date <= PDF_HISTORY_CUTOFF
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
          const dates = [...new Set(pairedEvents.map((event) => event.date).filter(Boolean))];
          const replacementEvent = {
            id: `system-pmi-brake-${key}`,
            type: "inspection_brake",
            status: allCompleted ? "completed" : allBooked ? "booked" : "planned",
            date: inspectionEvent.date || brakeEvent.date,
            registration: pairedEvents[0]?.registration,
            bookingId: inspectionEvent.bookingId || brakeEvent.bookingId || "",
            source: pairedEvents.every(
              (event) => event.source === "vehicle_last_completed_date"
            )
              ? "vehicle_last_completed_date"
              : "",
            week: pairedEvents[0]?.week,
            label: `PMI + brake test ${allCompleted ? "completed" : allBooked ? "booked" : "planned"}${
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
          completedInspectionDatesByRegistration.get(registration) || [];
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
        return {
          registration,
          vehicle,
          inspectionCompletionDates,
          status:
            plannerYear >= CURRENT_YEAR && complianceStatus === "VOR"
              ? "VOR"
              : baseStatus,
        };
      });
      return {
        year: plannerYear,
        imported,
        importedEntryCount: historicalImportedEvents.length,
        visibleRegistrations,
        liveEvents,
        eventsByCell,
        displayedStatuses,
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
  const nextInspectionEvents = (currentPlanner?.liveEvents || []).filter(
    (event) => event.type === "inspection" && event.status === "booked"
  );
  const overdueCount = nextInspectionEvents.filter((event) => (daysFromToday(event.date) ?? 1) < 0).length;
  const dueSoonCount = nextInspectionEvents.filter((event) => {
    const days = daysFromToday(event.date);
    return days !== null && days >= 0 && days <= 56;
  }).length;
  const openVehicle = (registration) => {
    const vehicle = vehicleByRegistration.get(registration);
    if (vehicle?.id) router.push(`/vehicle-edit/${encodeURIComponent(vehicle.id)}`);
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
              Saved PMI, brake-test, MOT and service appointments with live Active/VOR status in one ISO-week view.
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
          <Legend className={styles.booked} label="Booked" />
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
                        {planner.importedEntryCount} historical imported entries
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
                      <div className={styles.plannerCard}>
                        {planner.visibleRegistrations.length ? (
                          <PlannerTable
                            planner={planner}
                            currentWeek={currentWeek}
                            openVehicle={openVehicle}
                            openPlannerEntry={openPlannerEntry}
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
          PDF dates through 31/07/2026 are retained as completed history. Future PMI, brake-test,
          MOT and service entries come only from active saved maintenance appointments.
        </footer>

        {selectedMaintenanceEvent ? (
          <DashboardMaintenanceModal
            event={selectedMaintenanceEvent}
            onClose={() => setSelectedMaintenanceEvent(null)}
          />
        ) : null}
      </main>
    </HeaderSidebarLayout>
  );
}

function PlannerTable({ planner, currentWeek, openVehicle, openPlannerEntry }) {
  const statusByRegistration = new Map(
    planner.displayedStatuses.map(
      ({ registration, vehicle, status, inspectionCompletionDates }) => [
        registration,
        { vehicle, status, inspectionCompletionDates },
      ]
    )
  );

  return (
    <div className={styles.tableScroll}>
      <table className={styles.plannerTable}>
        <thead>
          <tr>
            <th className={styles.weekColumn}>ISO week</th>
            {planner.displayedStatuses.map(({ registration, vehicle, status }) => (
              <th key={registration} className={assetTone(registration)}>
                <button
                  type="button"
                  className={styles.vehicleHeader}
                  onClick={() => openVehicle(registration)}
                  disabled={!vehicle?.id}
                  title={vehicle?.id ? "Open vehicle record" : "No matching live vehicle record"}
                >
                  <strong>{registration}</strong>
                  <span className={`${styles.statusBadge} ${statusTone(status)}`}>{status}</span>
                  <small>{resolveVehicleLabel(vehicle, vehicle ? "" : "Imported record")}</small>
                </button>
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
                  const operatingStatus = hgvComplianceStatusForIsoWeek(
                    statusRecord?.vehicle,
                    statusRecord?.status,
                    planner.year,
                    week,
                    planner.year < CURRENT_YEAR,
                    planner.year >= CURRENT_YEAR
                      ? statusRecord?.inspectionCompletionDates || []
                      : []
                  );
                  return (
                    <td
                      key={registration}
                      className={
                        operatingStatus === "VOR"
                          ? styles.cellVor
                          : operatingStatus === "OFF FLEET"
                            ? styles.cellOffFleet
                            : undefined
                      }
                    >
                      <div className={styles.cellEvents}>
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
                                        ? "SVC"
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
