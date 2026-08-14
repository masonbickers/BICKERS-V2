"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, getDocs } from "firebase/firestore";
import Papa from "papaparse";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ContactRound,
  FileText,
  FileUp,
  IdCard,
  Search,
  UserPlus,
  Users,
  PauseCircle,
  ShieldAlert,
} from "lucide-react";

import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  PeopleFleetHeaderActions,
  PeopleFleetPage,
  PeopleFleetPageHeader,
} from "@/app/components/PeopleFleetPage";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  MetricCard,
  Select,
} from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import styles from "./page.styles.module.css";
import {
  EMPLOYEE_PERSONNEL_COLLECTION,
  checklistProgress,
  deriveOnboardingChecklist,
  getPersonnelCompliance,
  mergeEmployeePersonnel,
  withoutPrivateEmployeeFields,
} from "@/app/utils/employeePersonnel";

function isEmployeeRecord(employee = {}) {
  const role = String(employee.role || "").trim().toLowerCase();
  const employmentType = String(employee.employmentType || employee.contractType || employee.employeeType || "")
    .trim()
    .toLowerCase();
  const jobTitleBlob = Array.isArray(employee.jobTitle)
    ? employee.jobTitle.join(" ").toLowerCase()
    : String(employee.jobTitle || "").toLowerCase();
  const nameBlob = [employee.name, employee.fullName, employee.employeeName, employee.email]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (
    employee.deleted === true ||
    employee.isDeleted === true ||
    employee.archived === true ||
    employee.isArchived === true
  ) return false;
  const appAccess = employee.appAccess && typeof employee.appAccess === "object" ? employee.appAccess : {};
  if (employee.isService === true && appAccess.user !== true) return false;
  if (employee.preview === true || employee.isPreview === true || employee.test === true || employee.isTest === true) return false;
  if (role === "service" || role === "freelancer" || role === "freelance") return false;
  if (employmentType.includes("freelance") || jobTitleBlob.includes("freelance")) return false;
  if (/\b(preview lane|test employee|demo employee)\b/.test(nameBlob)) return false;
  return !nameBlob.includes("example.invalid");
}

function employmentStatus(employee = {}) {
  const status = String(employee.employmentStatus || "").trim();
  if (status) return status;
  return employee.active === false ? "Ended" : "Active";
}

function employmentStatusKey(employee = {}) {
  const value = employmentStatus(employee).toLowerCase();
  if (value === "paused") return "paused";
  if (value === "ended" || value === "leaver") return "ended";
  if (value === "on leave") return "leave";
  if (value === "probation") return "probation";
  return employee.active === false ? "ended" : "active";
}

function employmentBadgeTone(employee = {}) {
  const key = employmentStatusKey(employee);
  if (key === "paused" || key === "leave") return "warning";
  if (key === "probation") return "info";
  if (key === "ended") return "neutral";
  return "success";
}

function getPersonnelStatus(employee = {}) {
  const file = employee.personnelFile || {};
  const passport = employee.passport || file.passport || {};
  const drivingLicence = employee.drivingLicence || file.drivingLicence || {};
  const emergencyContacts = Array.isArray(employee.emergencyContacts)
    ? employee.emergencyContacts
    : Array.isArray(file.emergencyContacts)
      ? file.emergencyContacts
      : [];
  const documents = Array.isArray(employee.personnelDocuments)
    ? employee.personnelDocuments
    : Array.isArray(file.documents)
      ? file.documents
      : [];
  const hasMeaningfulValue = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return Boolean(normalized) && !["-", "/", "0", "none", "n/a", "na"].includes(normalized);
  };
  const hasPassport = [employee.passportNumber, passport.number, passport.documentUrl].some(hasMeaningfulValue);
  const hasLicence = [employee.licenceNumber, employee.licenseNumber, drivingLicence.number, drivingLicence.documentUrl].some(hasMeaningfulValue);
  const emergencyCount = emergencyContacts.filter((row) =>
    [row?.name, row?.phone, row?.email].some((value) => String(value || "").trim())
  ).length;
  const documentCount =
    documents.filter((row) =>
      [row?.type, row?.title, row?.reference, row?.documentUrl].some((value) => String(value || "").trim())
    ).length +
    (passport.documentUrl ? 1 : 0) +
    (drivingLicence.documentUrl ? 1 : 0);
  const completedSections = [hasPassport, hasLicence, emergencyCount > 0, documentCount > 0].filter(Boolean).length;

  return {
    hasPassport,
    hasLicence,
    emergencyCount,
    documentCount,
    completedSections,
    isComplete: completedSections === 4,
  };
}

function getInitials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function formatDate(value) {
  if (!value) return "Not added";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function employeeSearchText(employee, includePrivate = false) {
  const jobs = Array.isArray(employee.jobTitle) ? employee.jobTitle.join(" ") : employee.jobTitle;
  return [employee.name, employee.employeeCode, employee.email, employee.mobile, jobs, includePrivate ? employee.licenceNumber : ""]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

export default function EmployeeListPage() {
  const router = useRouter();
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState("all");
  const [employmentFilter, setEmploymentFilter] = useState("current");
  const [onboardingFilter, setOnboardingFilter] = useState("all");
  const [complianceFilter, setComplianceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadEmployees = useCallback(async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "read employees" });
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const [employeeSnapshot, personnelSnapshot] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "employees", dataAccessState)),
        authAccess.isAdmin
          ? getDocs(tenantCollectionQuery(db, EMPLOYEE_PERSONNEL_COLLECTION, dataAccessState))
          : Promise.resolve(null),
      ]);
      const personnelById = new Map(
        (personnelSnapshot?.docs || []).map((personnelDoc) => [personnelDoc.id, personnelDoc.data()])
      );
      setEmployees(employeeSnapshot.docs
        .map((employeeDoc) => {
          const operational = { id: employeeDoc.id, ...employeeDoc.data() };
          return authAccess.isAdmin
            ? mergeEmployeePersonnel(operational, personnelById.get(employeeDoc.id) || {})
            : withoutPrivateEmployeeFields(operational);
        })
        .filter(isEmployeeRecord));
    } catch (error) {
      if (!handleFirestoreAccessError(error, { collectionName: "employees", operation: "read employees" })) {
        console.error("[employees] load error:", error);
      }
      setLoadError("Employee files could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [authAccess.isAdmin, dataAccessState]);

  useEffect(() => {
    loadEmployees();
  }, [accessKey, loadEmployees]);

  const complianceDue = useMemo(
    () => authAccess.isAdmin
      ? employees.filter((employee) => getPersonnelCompliance(employee).dueWithin90Days > 0).length
      : 0,
    [authAccess.isAdmin, employees]
  );

  const employmentMetrics = useMemo(
    () =>
      employees.reduce(
        (summary, employee) => {
          const key = employmentStatusKey(employee);
          if (key === "active" || key === "probation" || key === "leave") summary.current += 1;
          if (key === "paused") summary.paused += 1;
          if (key === "ended") summary.ended += 1;
          return summary;
        },
        { current: 0, paused: 0, ended: 0 }
      ),
    [employees]
  );

  const personnelMetrics = useMemo(
    () =>
      employees.reduce(
        (summary, employee) => {
          const status = getPersonnelStatus(employee);
          if (status.isComplete) summary.complete += 1;
          if (status.emergencyCount > 0) summary.withEmergency += 1;
          if (status.documentCount > 0) summary.withDocuments += 1;
          return summary;
        },
        { complete: 0, withEmergency: 0, withDocuments: 0 }
      ),
    [employees]
  );

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = employees.filter((employee) => {
      const status = getPersonnelStatus(employee);
      const onboarding = checklistProgress(deriveOnboardingChecklist(employee));
      const compliance = getPersonnelCompliance(employee);
      const matchesQuery = !normalizedQuery || employeeSearchText(employee, authAccess.isAdmin).includes(normalizedQuery);
      const matchesReadiness =
        readiness === "all" ||
        (readiness === "complete" && status.isComplete) ||
        (readiness === "attention" && !status.isComplete);
      const lifecycleKey = employmentStatusKey(employee);
      const matchesEmployment =
        employmentFilter === "all" ||
        (employmentFilter === "current" && ["active", "probation", "leave"].includes(lifecycleKey)) ||
        lifecycleKey === employmentFilter;
      const matchesOnboarding =
        onboardingFilter === "all" ||
        (onboardingFilter === "complete" && onboarding.percentage === 100) ||
        (onboardingFilter === "attention" && onboarding.percentage < 100);
      const matchesCompliance =
        complianceFilter === "all" ||
        (complianceFilter === "due" && compliance.dueWithin90Days > 0) ||
        (complianceFilter === "overdue" && compliance.overdue > 0) ||
        (complianceFilter === "current" && compliance.dueWithin90Days === 0);
      return matchesQuery && matchesReadiness && matchesEmployment && matchesOnboarding && matchesCompliance;
    });

    return rows.sort((a, b) => {
      if (sortBy === "dob") return String(a.dob || "9999").localeCompare(String(b.dob || "9999"));
      if (sortBy === "jobTitle") {
        const aJob = Array.isArray(a.jobTitle) ? a.jobTitle[0] : a.jobTitle;
        const bJob = Array.isArray(b.jobTitle) ? b.jobTitle[0] : b.jobTitle;
        return String(aJob || "zzzz").localeCompare(String(bJob || "zzzz"));
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [authAccess.isAdmin, complianceFilter, employees, employmentFilter, onboardingFilter, query, readiness, sortBy]);

  const hasActiveFilters = Boolean(query.trim()) || readiness !== "all" || employmentFilter !== "current" || onboardingFilter !== "all" || complianceFilter !== "all";

  return (
    <HeaderSidebarLayout>
      <PeopleFleetPage className={styles.page}>
        <PeopleFleetPageHeader
          title="Employee personnel files"
          subtitle="Keep contact, right-to-work, licence, emergency and HR records together."
          actions={
            <PeopleFleetHeaderActions>
              <Badge variant="info">{employees.length} employee records</Badge>
              {authAccess.isAdmin ? <Button variant="primary" onClick={() => router.push("/add-employee")}>
                <UserPlus size={16} /> Add employee
              </Button> : null}
            </PeopleFleetHeaderActions>
          }
        />

        <div className={styles.metricsGrid} aria-label="Personnel file overview">
          <MetricCard
            label="Current employees"
            value={employmentMetrics.current}
            hint={`${employmentMetrics.paused} paused · ${employmentMetrics.ended} former`}
            icon={<Users size={19} />}
          />
          <MetricCard
            label="Files ready"
            value={personnelMetrics.complete}
            hint={`${Math.max(0, employees.length - personnelMetrics.complete)} need attention`}
            icon={<CheckCircle2 size={19} />}
            tone={employees.length > 0 && personnelMetrics.complete === employees.length ? "success" : "info"}
            onClick={() => setReadiness("complete")}
          />
          <MetricCard
            label="Emergency cover"
            value={personnelMetrics.withEmergency}
            hint={`of ${employees.length} employees`}
            icon={<ContactRound size={19} />}
            tone={employees.length > 0 && personnelMetrics.withEmergency < employees.length ? "warning" : "success"}
          />
          <MetricCard
            label="HR documents"
            value={personnelMetrics.withDocuments}
            hint="files with documents"
            icon={<IdCard size={19} />}
            tone="info"
          />
        </div>

        <section className={styles.register} aria-labelledby="employee-register-title">
          <div className={styles.registerHeader}>
            <div>
              <h2 id="employee-register-title">Personnel file register</h2>
              <p>Find an employee and open their file to review or update records.</p>
            </div>
            <Badge>{visibleEmployees.length} shown</Badge>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              <Search size={17} aria-hidden="true" />
              <span className={styles.srOnly}>Search employees</span>
              <Input
                bare
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, role, email, mobile or licence…"
              />
            </label>
            <div className={styles.filterGroup}>
              <label>
                <span>File status</span>
                <Select bare value={readiness} onChange={(event) => setReadiness(event.target.value)}>
                  <option value="all">All files</option>
                  <option value="attention">Needs attention</option>
                  <option value="complete">File ready</option>
                </Select>
              </label>
              <label>
                <span>Employment</span>
                <Select bare value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)}>
                  <option value="current">Current employees</option>
                  <option value="all">All personnel records</option>
                  <option value="active">Active</option>
                  <option value="probation">Probation</option>
                  <option value="leave">On leave</option>
                  <option value="paused">Paused</option>
                  <option value="ended">Former employees</option>
                </Select>
              </label>
              <label>
                <span>Sort</span>
                <Select bare value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="name">Name A–Z</option>
                  <option value="jobTitle">Job title A–Z</option>
                  <option value="dob">DOB, oldest first</option>
                </Select>
              </label>
            </div>
          </div>

          {loadError ? (
            <Alert variant="danger" className={styles.loadAlert}>
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={loadEmployees}>Try again</Button>
            </Alert>
          ) : null}

          <div className={styles.tableViewport}>
            <table className={styles.employeeTable}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Contact</th>
                  <th>Job title</th>
                  <th>Licence</th>
                  <th>Personnel file</th>
                  <th><span className={styles.srOnly}>Action</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? <LoadingRows /> : null}
                {!loading && visibleEmployees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    onOpen={() => router.push(`/edit-employee/${employee.id}`)}
                  />
                ))}
              </tbody>
            </table>

            {!loading && visibleEmployees.length === 0 ? (
              <EmptyState
                className={styles.emptyState}
                icon={<Users size={28} />}
                title={hasActiveFilters ? "No employees match your filters" : "No employee files yet"}
                description={hasActiveFilters ? "Try a different search or clear the filters." : "Add the first employee to start their personnel file."}
                action={
                  hasActiveFilters ? (
                    <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setReadiness("all"); setEmploymentFilter("current"); }}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => router.push("/add-employee")}>
                      <UserPlus size={15} /> Add employee
                    </Button>
                  )
                }
              />
            ) : null}
          </div>
        </section>

        <details className={styles.importPanel}>
          <summary>
            <span className={styles.importIcon}><FileUp size={18} /></span>
            <span>
              <strong>Import employees from CSV</strong>
              <small>For bulk additions using the standard employee template</small>
            </span>
            <ChevronRight className={styles.summaryChevron} size={18} aria-hidden="true" />
          </summary>
          <EmployeeCSVImport dataAccessState={dataAccessState} onImportComplete={loadEmployees} />
        </details>
      </PeopleFleetPage>
    </HeaderSidebarLayout>
  );
}

function EmployeeRow({ employee, onOpen }) {
  const personnel = getPersonnelStatus(employee);
  const jobTitles = [...new Set(
    (Array.isArray(employee.jobTitle) ? employee.jobTitle : [employee.jobTitle])
      .map((job) => String(job || "").trim())
      .filter(Boolean)
  )];

  return (
    <tr className={styles.employeeRow} onClick={onOpen}>
      <td data-label="Employee">
        <div className={styles.employeeIdentity}>
          <span className={styles.avatar}>{getInitials(employee.name)}</span>
          <span>
            <span className={styles.employeeNameRow}>
              <strong>{employee.name || "Unnamed employee"}</strong>
              <Badge variant={employmentBadgeTone(employee)}>{employmentStatus(employee)}</Badge>
            </span>
            <small>DOB {formatDate(employee.dob)}</small>
          </span>
        </div>
      </td>
      <td data-label="Contact">
        <div className={styles.contactDetails}>
          <span>{employee.email || "No email"}</span>
          <small>{employee.mobile || "No mobile"}</small>
        </div>
      </td>
      <td data-label="Job title">
        {jobTitles.length ? (
          <div className={styles.jobTitle} title={jobTitles.join(", ")}>
            <strong>{jobTitles[0]}</strong>
            {jobTitles.length > 1 ? <small>Also: {jobTitles.slice(1).join(" · ")}</small> : null}
          </div>
        ) : <span className={styles.muted}>Not added</span>}
      </td>
      <td data-label="Licence">
        <span className={employee.licenceNumber ? styles.value : styles.muted}>
          {employee.licenceNumber || "Not added"}
        </span>
      </td>
      <td data-label="Personnel file">
        <div className={styles.fileStatus}>
          <div className={styles.statusHeading}>
            {personnel.isComplete ? (
              <Badge variant="success"><CheckCircle2 size={13} /> File ready</Badge>
            ) : (
              <Badge variant="warning"><AlertCircle size={13} /> {4 - personnel.completedSections} items missing</Badge>
            )}
            <span>{personnel.completedSections}/4</span>
          </div>
          <span className={styles.progressTrack} aria-label={`${personnel.completedSections} of 4 file sections complete`}>
            <span style={{ width: `${personnel.completedSections * 25}%` }} />
          </span>
          <small>{personnel.emergencyCount} emergency · {personnel.documentCount} documents</small>
        </div>
      </td>
      <td className={styles.actionCell}>
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
          aria-label={`Open ${employee.name || "employee"} personnel file`}
        >
          Open file <ChevronRight size={15} />
        </Button>
      </td>
    </tr>
  );
}

function LoadingRows() {
  return Array.from({ length: 5 }, (_, index) => (
    <tr className={styles.loadingRow} key={index} aria-hidden="true">
      <td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td><td><span /></td>
    </tr>
  ));
}

function EmployeeCSVImport({ onImportComplete, dataAccessState }) {
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setMessage("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        setImporting(true);
        let imported = 0;
        let skipped = 0;

        for (const employee of data) {
          if (!employee.name || !employee.dob || !employee.licenceNumber) {
            skipped += 1;
            continue;
          }

          try {
            await addDoc(collection(db, "employees"), tenantPayload(dataAccessState, {
              name: employee.name,
              dob: employee.dob,
              licenceNumber: employee.licenceNumber,
              jobTitle: employee.jobTitle ? employee.jobTitle.split(",").map((job) => job.trim()) : [],
              email: employee.email || "",
              mobile: employee.mobile || "",
            }));
            imported += 1;
          } catch (error) {
            skipped += 1;
            if (!handleFirestoreAccessError(error, { collectionName: "employees", operation: "import employee" })) {
              console.error("Error importing employee:", error);
            }
          }
        }

        setImporting(false);
        setMessageTone(imported > 0 ? "success" : "warning");
        setMessage(`${imported} employee${imported === 1 ? "" : "s"} imported${skipped ? ` · ${skipped} skipped` : ""}.`);
        if (imported > 0) await onImportComplete?.();
      },
      error: () => {
        setImporting(false);
        setMessageTone("danger");
        setMessage("That CSV could not be read. Check the file and try again.");
      },
    });
  };

  return (
    <div className={styles.importBody}>
      <div>
        <h3>CSV requirements</h3>
        <p>Required columns: <code>name</code>, <code>dob</code>, <code>licenceNumber</code>. Optional: <code>jobTitle</code>, <code>email</code>, <code>mobile</code>.</p>
      </div>
      <div className={styles.filePicker}>
        <label className={styles.fileButton}>
          <FileText size={16} />
          <span>{fileName || "Choose CSV file"}</span>
          <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} disabled={importing} />
        </label>
        {importing ? <span className={styles.importing}>Importing employees…</span> : null}
      </div>
      {message ? <Alert variant={messageTone}>{message}</Alert> : null}
    </div>
  );
}
