"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
} from "firebase/firestore";
import {
  Activity,
  CalendarDays,
  HeartPulse,
  ListChecks,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { ADMIN_EMAILS } from "@/app/utils/adminAccess";
import {
  handleFirestoreAccessError,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* -------------------------------------------
   Admin gate
    allow if email is in ADMIN_EMAILS OR users.role === "admin"
------------------------------------------- */
/* -------------------------------------------
   Mini design system (matches your style)
------------------------------------------- */
const UI = UI_TOKENS;

const Tabs = {
  ACCESS: "Access",
  HOLIDAY: "Holiday Allowance",
  SICK: "Sick Leave",
  ACTIVITY: "Activity",
  AUDIT: "Audit Log",
  APRIL_FOOLS: "April Fools",
};

const TAB_ICONS = {
  [Tabs.ACCESS]: UserCog,
  [Tabs.HOLIDAY]: CalendarDays,
  [Tabs.SICK]: HeartPulse,
  [Tabs.ACTIVITY]: Activity,
  [Tabs.AUDIT]: ListChecks,
  [Tabs.APRIL_FOOLS]: ShieldCheck,
};

const isAprilFoolsDay = () => {
  const now = new Date();
  return now.getMonth() === 3 && now.getDate() === 1;
};

/* -------------------------------------------
   Timestamp-safe helpers
------------------------------------------- */
const toDateSafe = (v) => {
  try {
    if (!v) return null;
    if (v?.toDate && typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000); // Timestamp-like
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
};

const fmtYMD = (v) => {
  if (!v) return "-";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = toDateSafe(v);
  if (!d) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toISO = (d) => (d ? d : "");

const tsToMs = (t) => {
  if (!t) return 0;
  if (typeof t?.toMillis === "function") return t.toMillis();
  const asDate = t instanceof Date ? t : new Date(t);
  const ms = asDate.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const bestUserDoc = (a, b) => {
  const aIsUidDoc = a?.uid && a?.id === a.uid;
  const bIsUidDoc = b?.uid && b?.id === b.uid;
  if (aIsUidDoc && !bIsUidDoc) return a;
  if (!aIsUidDoc && bIsUidDoc) return b;

  const aUpdated = tsToMs(a?.updatedAt);
  const bUpdated = tsToMs(b?.updatedAt);
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? a : b;

  const aCreated = tsToMs(a?.createdAt);
  const bCreated = tsToMs(b?.createdAt);
  if (aCreated !== bCreated) return aCreated > bCreated ? a : b;

  return a;
};

const daysBetweenInclusive = (startISO, endISO) => {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return isNaN(days) ? 0 : Math.max(0, days);
};

const dedupeUsersByEmail = (raw = []) => {
  const byKey = new Map();
  const rawCount = raw.length;

  for (const r of raw) {
    const email = (r.email || "").toLowerCase().trim();
    const uid = String(r.uid || r.id || "").trim();
    const key = email || uid;
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing) byKey.set(key, r);
    else byKey.set(key, bestUserDoc(existing, r));
  }

  const deduped = Array.from(byKey.values()).sort((a, b) =>
    (a.email || a.uid || a.id || "").localeCompare(b.email || b.uid || b.id || "")
  );

  return {
    users: deduped,
    meta: {
      rawCount,
      dedupedCount: deduped.length,
      duplicates: Math.max(0, rawCount - deduped.length),
    },
  };
};

const buildAdminActivityRows = (data = {}) => {
  const rows = [];
  const pushRow = (row) => {
    const at = toDateSafe(row.at);
    if (!at) return;
    rows.push({
      id: row.id,
      at,
      user: String(row.user || "Unknown").trim() || "Unknown",
      action: String(row.action || "Updated").trim() || "Updated",
      area: String(row.area || "").trim(),
      details: String(row.details || "").trim(),
    });
  };

  const addHistoryRows = (items = [], areaLabel) => {
    items.forEach((item) => {
      const history = Array.isArray(item.history) ? item.history : [];
      history.forEach((entry, index) => {
        pushRow({
          id: `${areaLabel}-${item.id}-${index}`,
          at: entry?.timestamp || entry?.updatedAt || item?.updatedAt || item?.createdAt,
          user: entry?.user || entry?.updatedBy || entry?.by || item?.lastEditedBy || item?.createdBy,
          action: entry?.action || "Updated",
          area: areaLabel,
          details:
            entry?.details ||
            (Array.isArray(entry?.changes) ? entry.changes.join(" | ") : "") ||
            `${areaLabel} ${item.id}`,
        });
      });

      if (history.length === 0 && (item?.createdAt || item?.updatedAt)) {
        pushRow({
          id: `${areaLabel}-${item.id}-fallback`,
          at: item?.updatedAt || item?.createdAt,
          user: item?.lastEditedBy || item?.updatedBy || item?.createdBy,
          action: item?.updatedAt ? "Updated" : "Created",
          area: areaLabel,
          details: `${areaLabel} ${item.id}`,
        });
      }
    });
  };

  addHistoryRows(data.bookings || [], "Booking");
  addHistoryRows(data.maintenanceBookings || [], "Maintenance");

  (data.maintenanceJobs || []).forEach((item) => {
    pushRow({
      id: `Maintenance Job-${item.id}`,
      at: item.updatedAtServer || item.updatedAt || item.createdAt,
      user: item.updatedBy || item.createdBy,
      action: item.updatedAt ? "Updated" : "Created",
      area: "Maintenance Job",
      details: item.title || item.id,
    });
  });

  (data.holidays || []).forEach((item) => {
    pushRow({
      id: `Holiday-${item.id}`,
      at: item.updatedAt || item.createdAt || item.startDate,
      user: item.updatedBy || item.createdByEmail || item.createdByName || item.employee,
      action: item.updatedAt ? "Updated holiday" : "Created holiday",
      area: "Holiday",
      details: `${item.employee || "Unknown"} ${fmtYMD(item.startDate)} -> ${fmtYMD(
        item.endDate || item.startDate
      )}`,
    });
  });

  (data.sickLeave || []).forEach((item) => {
    pushRow({
      id: `Sick-${item.id}`,
      at: item.updatedAt || item.createdAt || item.startDate,
      user: item.updatedBy || item.createdBy || "Unknown",
      action: item.updatedAt ? "Updated sick leave" : "Created sick leave",
      area: "Sick Leave",
      details: `${item.employeeName || item.employeeId || "Unknown"} ${fmtYMD(
        item.startDate
      )} -> ${fmtYMD(item.endDate || item.startDate)}`,
    });
  });

  (data.users || []).forEach((item) => {
    pushRow({
      id: `User-${item.id}`,
      at: item.updatedAt || item.createdAt,
      user: item.updatedBy || item.email || item.id,
      action: item.updatedAt ? "Updated user access" : "Created user",
      area: "Access",
      details: item.email || item.id,
    });
  });

  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows.slice(0, 500);
};

const fetchAdminOverviewDataFromServer = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not signed in.");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/admin/overview", {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not load admin overview.");
  return data;
};

export default function AdminPage() {
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

  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState(Tabs.ACCESS);

  const [qText, setQText] = useState("");
  const [toast, setToast] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState("");

  // Data
  const [users, setUsers] = useState([]); // de-duped list
  const [usersMeta, setUsersMeta] = useState({
    rawCount: 0,
    dedupedCount: 0,
    duplicates: 0,
  });

  const [employees, setEmployees] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [sickLeaves, setSickLeaves] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityDay, setActivityDay] = useState(() => fmtYMD(new Date()));
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [systemRecovered, setSystemRecovered] = useState(false);

  // Sick form (add)
  const [newSick, setNewSick] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "",
    notes: "",
  });

  //  Sick edit state
  const [editingSick, setEditingSick] = useState(null); // {id, employeeId, startDate, endDate, reason, notes}
  const [savingSick, setSavingSick] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2200);
  };

  const callAdminUserAction = async (userId, payload) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You need to sign in again.");

    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Admin action failed.");
    return data;
  };

  const callAdminUserDelete = async (userId) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You need to sign in again.");

    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Delete failed.");
    return data;
  };

  const refreshServerAccess = async (currentUser) => {
    const idToken = await currentUser.getIdToken();
    const res = await fetch("/api/security/bootstrap-access", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not refresh admin access.");
    return data?.access || {};
  };

  /* -------------------------------------------
     Auth + Admin gate
      allow if email in ADMIN_EMAILS OR server-bootstrapped role is admin/platformAdmin
  -------------------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setChecking(true);
      try {
        if (!u) {
          router.push("/login");
          return;
        }

        const email = String(u.email || "").trim().toLowerCase();
        const access = await refreshServerAccess(u);
        const role = String(access?.role || "").trim().toLowerCase();
        const isAdminRole = ["admin", "platformadmin"].includes(role);
        const isAllowListed = ADMIN_EMAILS.includes(email);

        if (!isAllowListed && !isAdminRole) {
          router.push("/home");
          return;
        }

        setMe(u);
        await bootstrap();
      } catch (error) {
        console.error("Admin bootstrap failed:", error);
        showToast("error", error?.message || "Could not load admin data.");
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------
     Fetch
  -------------------------------------------- */
  const bootstrap = async () => {
    setActivityLoading(true);
    setAuditLoading(true);
    try {
      const overview = await fetchAdminOverviewData();
      hydrateAdminOverview(overview);
    } finally {
      setActivityLoading(false);
      setAuditLoading(false);
    }
  };

  const fetchAdminOverviewData = async () => {
    return fetchAdminOverviewDataFromServer();
  };

  const hydrateAdminOverview = (overview = {}) => {
    const deduped = dedupeUsersByEmail(overview.users || []);
    setUsers(deduped.users);
    setUsersMeta(deduped.meta);
    setEmployees(overview.employees || []);
    setAllowances(overview.holidayAllowances || []);
    setSickLeaves(overview.sickLeave || []);
    setActivityRows(buildAdminActivityRows(overview));
    setAuditRows(
      (overview.adminAuditLogs || []).slice(0, 200).map((data) => ({
        id: data.id,
        ...data,
        at: toDateSafe(data.createdAt),
      }))
    );
  };

  const fetchUsers = async () => {
    const overview = await fetchAdminOverviewData();
    const deduped = dedupeUsersByEmail(overview.users || []);
    setUsers(deduped.users);
    setUsersMeta(deduped.meta);
  };

  const fetchEmployees = async () => {
    const overview = await fetchAdminOverviewData();
    setEmployees(overview.employees || []);
  };

  const fetchAllowances = async () => {
    const overview = await fetchAdminOverviewData();
    setAllowances(overview.holidayAllowances || []);
  };

  const fetchSickLeaves = async () => {
    const overview = await fetchAdminOverviewData();
    setSickLeaves(overview.sickLeave || []);
  };

  const fetchActivity = async () => {
    setActivityLoading(true);
    try {
      const overview = await fetchAdminOverviewData();
      setActivityRows(buildAdminActivityRows(overview));
    } catch (err) {
      console.error("Failed to load activity:", err);
      setActivityRows([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const overview = await fetchAdminOverviewData();
      setAuditRows(
        (overview.adminAuditLogs || []).slice(0, 200).map((data) => {
          return {
            id: data.id,
            ...data,
            at: toDateSafe(data.createdAt),
          };
        })
      );
    } catch (err) {
      console.error("Failed to load admin audit logs:", err);
      setAuditRows([]);
      showToast("error", "Could not load audit logs");
    } finally {
      setAuditLoading(false);
    }
  };

  /* -------------------------------------------
     Access management
  -------------------------------------------- */
  const updateUserRole = async (userId, role) => {
    try {
      await callAdminUserAction(userId, { action: "setRole", role });
      showToast("ok", "Role updated");
      await fetchUsers();
    } catch (e) {
      showToast("error", e?.message || "Failed to update role");
    }
  };

  const toggleUserEnabled = async (userId, current) => {
    try {
      await callAdminUserAction(userId, { action: "setEnabled", isEnabled: !current });
      showToast("ok", !current ? "User enabled" : "User disabled");
      await fetchUsers();
    } catch (e) {
      showToast("error", e?.message || "Failed to update user");
    }
  };

  const deleteAccessAccount = async (targetUser) => {
    if (!targetUser?.id) return;

    const label = targetUser.email || targetUser.name || targetUser.id;
    if (
      !confirm(
        `Delete access account for ${label}?\n\nThis removes their Firestore access record. It does not delete bookings, employees, timesheets, or the Clerk identity.`
      )
    ) {
      return;
    }

    setDeletingUserId(targetUser.id);
    try {
      const data = await callAdminUserDelete(targetUser.id);
      const count = Number(data?.deletedUserDocs || 1);
      showToast("ok", `Deleted ${count} access record${count === 1 ? "" : "s"}`);
      await fetchUsers();
      await fetchAuditLogs();
    } catch (e) {
      showToast("error", e?.message || "Failed to delete access account");
    } finally {
      setDeletingUserId("");
    }
  };

  /* -------------------------------------------
     Holiday allowance management (legacy table)
  -------------------------------------------- */
  const upsertAllowance = async (employeeId, patch) => {
    const ref = doc(db, "holidayAllowances", employeeId);
    const existing = await getDoc(ref);

    const base = existing.exists()
      ? existing.data()
      : {
          employeeId,
          annualAllowanceDays: 28,
          carryOverDays: 0,
          usedDays: 0,
          createdAt: serverTimestamp(),
        };

    await setDoc(
      ref,
      {
        ...base,
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("ok", "Holiday allowance saved");
    await fetchAllowances();
  };

  /* -------------------------------------------
     Sick leave (add)
  -------------------------------------------- */
  const addSickLeave = async () => {
    if (!newSick.employeeId) return showToast("warn", "Select an employee");
    if (!newSick.startDate || !newSick.endDate)
      return showToast("warn", "Pick start + end date");

    const startDate = toISO(newSick.startDate);
    const endDate = toISO(newSick.endDate);

    const days = daysBetweenInclusive(startDate, endDate);
    if (days <= 0) return showToast("warn", "Dates look invalid");

    try {
      await addDoc(collection(db, "sickLeave"), tenantPayload(dataAccessState, {
        employeeId: newSick.employeeId,
        startDate,
        endDate,
        days,
        reason: newSick.reason || "",
        notes: newSick.notes || "",
        createdAt: serverTimestamp(),
        createdBy: me?.email || "",
      }));
    } catch (error) {
      if (!handleFirestoreAccessError(error, { collectionName: "sickLeave", operation: "create sick leave" })) {
        console.error("Failed to add sick leave:", error);
      }
      return showToast("error", error?.message || "Failed to record sick leave");
    }

    setNewSick({
      employeeId: "",
      startDate: "",
      endDate: "",
      reason: "",
      notes: "",
    });
    showToast("ok", "Sick leave recorded");
    await fetchSickLeaves();
  };

  /* -------------------------------------------
     Sick leave (edit)
  -------------------------------------------- */
  const startEditSick = (s) => {
    setEditingSick({
      id: s.id,
      employeeId: s.employeeId || "",
      startDate: fmtYMD(s.startDate) === "-" ? "" : fmtYMD(s.startDate),
      endDate: fmtYMD(s.endDate) === "-" ? "" : fmtYMD(s.endDate),
      reason: s.reason || "",
      notes: s.notes || "",
    });
  };

  const cancelEditSick = () => setEditingSick(null);

  const saveEditSick = async () => {
    if (!editingSick) return;

    if (!editingSick.employeeId) return showToast("warn", "Select an employee");
    if (!editingSick.startDate || !editingSick.endDate)
      return showToast("warn", "Pick start + end date");

    const days = daysBetweenInclusive(editingSick.startDate, editingSick.endDate);
    if (days <= 0) return showToast("warn", "Dates look invalid");

    setSavingSick(true);
    try {
      await updateDoc(doc(db, "sickLeave", editingSick.id), {
        employeeId: editingSick.employeeId,
        startDate: editingSick.startDate, // stored as yyyy-mm-dd
        endDate: editingSick.endDate, // stored as yyyy-mm-dd
        days,
        reason: editingSick.reason || "",
        notes: editingSick.notes || "",
        updatedAt: serverTimestamp(),
        updatedBy: me?.email || "",
      });

      showToast("ok", "Sick leave updated");
      setEditingSick(null);
      await fetchSickLeaves();
    } catch (e) {
      showToast("error", e?.message || "Failed to update");
    } finally {
      setSavingSick(false);
    }
  };

  const deleteSickLeave = async (id) => {
    if (!confirm("Delete this sick leave record?")) return;
    try {
      await deleteDoc(doc(db, "sickLeave", id));
      showToast("ok", "Deleted");
      await fetchSickLeaves();
    } catch (e) {
      showToast("error", e?.message || "Failed to delete");
    }
  };

  const filteredActivityRows = useMemo(() => {
    const q = qText.trim().toLowerCase();
    return activityRows.filter((row) => {
      if (!q) return true;
      return [row.user, row.action, row.area, row.details]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [activityRows, qText]);

  const filteredUsers = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.name, u.displayName, u.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [users, qText]);

  const filteredAuditRows = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter((row) =>
      [
        row.action,
        row.area,
        row.actorEmail,
        row.actorUid,
        row.targetUserId,
        row.details ? JSON.stringify(row.details) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [auditRows, qText]);

  const activityByHour = useMemo(() => {
    const selectedDay = String(activityDay || "").trim();
    const counts = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      value: 0,
    }));

    filteredActivityRows.forEach((row) => {
      if (!(row.at instanceof Date) || Number.isNaN(row.at.getTime())) return;
      const rowDay = fmtYMD(row.at);
      if (rowDay !== selectedDay) return;
      const hour = row.at.getHours();
      if (hour >= 0 && hour <= 23) counts[hour].value += 1;
    });

    return counts;
  }, [filteredActivityRows, activityDay]);

  const activityHourMax = useMemo(
    () => Math.max(1, ...activityByHour.map((item) => item.value || 0)),
    [activityByHour]
  );
  const activitySummary = useMemo(() => {
    const selectedDay = String(activityDay || "").trim();
    const rowsForDay = filteredActivityRows.filter((row) => fmtYMD(row.at) === selectedDay);
    const uniqueUsers = new Set(rowsForDay.map((row) => row.user).filter(Boolean));
    const byArea = rowsForDay.reduce((acc, row) => {
      const key = row.area || "Other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topAreas = Object.entries(byArea)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      total: rowsForDay.length,
      uniqueUsers: uniqueUsers.size,
      topAreas,
    };
  }, [filteredActivityRows, activityDay]);
  const showAprilFools = isAprilFoolsDay();

  const aprilFoolsFeed = useMemo(
    () => [
      "Bypassing firewall rules...",
      "Reassigning all crane keys to interns...",
      "Uploading kettle inventory to mainframe...",
      "Converting holiday allowances into bitcoin...",
      "Reticulating stunt splines...",
      "Locking workshop radio to pirate frequency...",
      "Injecting geese into scheduling engine...",
      "Almost done. Probably.",
    ],
    []
  );

  /* -------------------------------------------
     Render
  -------------------------------------------- */
  if (checking) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={cardStyle}>Checking admin access...</div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={h1Style}>Admin</h1>
            <div style={pageSub}>
              Allowed: <b>email allow-list</b> OR <b>users.role = &quot;admin&quot;</b>
            </div>
          </div>

          <div className={layoutStyles.extracted1}>
            <div style={searchWrap}>
              <Search size={15} color={UI.muted} />
              <input
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder={
                  activeTab === Tabs.ACTIVITY
                    ? "Search activity (user, action, area)..."
                    : activeTab === Tabs.AUDIT
                    ? "Search audit log..."
                    : activeTab === Tabs.ACCESS
                    ? "Search users..."
                    : "Search employees (name or email)..."
                }
                style={headerSearchInputStyle}
              />
            </div>

            <button
              onClick={() => router.push("/admin/global-styling")}
              style={btnStyle}
              title="Manage global colours, typography and layout"
            >
              <Palette size={14} />
              Global styling
            </button>

            <button
              onClick={() => router.push("/admin/content-labels")}
              style={btnStyle}
              title="Manage company terminology and safe application wording"
            >
              <Palette size={14} />
              Content &amp; labels
            </button>

            <button
              onClick={() => router.push("/admin/security-audit")}
              style={btnStyle}
              title="Review user access and identity-link readiness"
            >
              <ShieldCheck size={14} />
              Security audit
            </button>

            <button
              onClick={() => router.push("/deleted-bookings")}
              style={btnStyle}
              title="View deleted bookings"
            >
              <Trash2 size={14} />
              Deleted bookings
            </button>

            <button onClick={bootstrap} style={btnStyle} title="Refresh">
              <RefreshCw size={14} />
              Refresh
            </button>

            {showAprilFools && (
              <button
                onClick={() => {
                  setSystemRecovered(false);
                  setActiveTab(Tabs.APRIL_FOOLS);
                }}
                style={{
                  ...btnStyle,
                  border: "1px solid var(--color-danger)",
                  background: "linear-gradient(135deg, var(--shell-sidebar-bg) 0%, var(--color-danger-hover) 100%)",
                  color: "var(--color-white)",
                  fontWeight: 1000,
                }}
                title="Definitely do not press this"
              >
                April Fools
              </button>
            )}
          </div>
        </div>

        <div style={statGrid}>
          <AdminStat
            icon={<Users size={17} />}
            label="Users"
            value={usersMeta.dedupedCount}
            detail={`raw ${usersMeta.rawCount}, duplicates ${usersMeta.duplicates}`}
          />
          <AdminStat icon={<Users size={17} />} label="Employees" value={employees.length} detail="loaded from employees" />
          <AdminStat icon={<CalendarDays size={17} />} label="Allowances" value={allowances.length} detail="holiday records" />
          <AdminStat icon={<HeartPulse size={17} />} label="Sick Leave" value={sickLeaves.length} detail="active records" />
        </div>

        {/* Tabs */}
        <div className={layoutStyles.extracted2}>
          {Object.values(Tabs)
            .filter((t) => showAprilFools || t !== Tabs.APRIL_FOOLS)
            .map((t) => {
            const active = t === activeTab;
            const Icon = TAB_ICONS[t] || ShieldCheck;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  ...btnStyle,
                  border: active ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
                  background: active ? UI.brand : UI.card,
                  color: active ? "var(--color-white)" : UI.text,
                  fontWeight: 900,
                }}
              >
                <Icon size={14} />
                {t}
              </button>
            );
          })}
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: UI.radiusSm,
              border: UI.border,
              background:
                toast.type === "ok"
                  ? "rgba(21,128,61,0.08)"
                  : toast.type === "warn"
                  ? "rgba(180,83,9,0.10)"
                  : "rgba(185,28,28,0.10)",
              color:
                toast.type === "ok"
                  ? UI.ok
                  : toast.type === "warn"
                  ? UI.warn
                  : UI.danger,
              fontWeight: 900,
            }}
          >
            {toast.message}
          </div>
        )}

        {/* Content */}
        <div style={{ marginTop: 16, display: "grid", gap: UI.gap }}>
          {/* ACCESS */}
          {activeTab === Tabs.ACCESS && (
            <Card title="Manage Access" subtitle="One line per user (de-duped by email or UID)">
              <div className={layoutStyles.extracted3}>
                <table className={layoutStyles.extracted4}>
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Enabled</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={emptyTd}>
                          {users.length === 0 ? (
                            <>
                              No access users found. Linked employees with authUid will appear here once access records are repaired.
                            </>
                          ) : (
                            "No users match your search."
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const email = (u.email || "").toLowerCase();
                        const locked = ADMIN_EMAILS.includes(email);
                        const enabled = u.isEnabled ?? true;
                        const deleteInProgress = deletingUserId === u.id;
                        const isSelf =
                          (me?.uid && u.id === me.uid) ||
                          (me?.email && email === String(me.email).trim().toLowerCase());
                        const deleteBlocked = locked || isSelf || deleteInProgress;

                        return (
                          <tr key={u.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text, whiteSpace: "nowrap" }}>
                                {u.email || "-"}
                                {locked && <span style={pillStyle}>Admin gate</span>}
                              </div>
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                {u.name || u.displayName || ""}
                              </div>
                            </Td>

                            <Td>
                              <select
                                value={u.role || "user"}
                                onChange={(e) => updateUserRole(u.id, e.target.value)}
                                style={selectStyle}
                              >
                                <option value="platformAdmin">platformAdmin</option>
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                              </select>
                            </Td>

                            <Td>
                              <span style={{ fontWeight: 900, color: enabled ? UI.ok : UI.danger }}>
                                {enabled ? "Enabled" : "Disabled"}
                              </span>
                            </Td>

                            <Td>
                              <div className={layoutStyles.extracted5}>
                                <button
                                  disabled={locked}
                                  onClick={() => toggleUserEnabled(u.id, enabled)}
                                  style={{
                                    ...btnStyle,
                                    background: locked ? "var(--color-surface-hover)" : UI.card,
                                    cursor: locked ? "not-allowed" : "pointer",
                                    color: locked ? UI.muted : UI.text,
                                    fontWeight: 900,
                                  }}
                                  title={
                                    locked
                                      ? "This account is part of the admin gate"
                                      : "Enable/disable this user"
                                  }
                                >
                                  {enabled ? "Disable" : "Enable"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteAccessAccount(u)}
                                  disabled={deleteBlocked}
                                  style={{
                                    ...btnStyle,
                                    borderColor: "var(--color-danger-border)",
                                    background: deleteBlocked ? "var(--color-surface-hover)" : "var(--color-danger-soft)",
                                    color: deleteBlocked ? UI.muted : UI.danger,
                                    cursor: deleteInProgress
                                      ? "wait"
                                      : deleteBlocked
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                  title={
                                    locked
                                      ? "Admin gate accounts cannot be deleted"
                                      : isSelf
                                        ? "You cannot delete your own access account"
                                        : "Delete this Firestore access account"
                                  }
                                >
                                  <Trash2 size={14} />
                                  {deleteInProgress ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* HOLIDAY */}
          {activeTab === Tabs.HOLIDAY && <EmployeesHolidayAllowancesTab />}

          {/* SICK */}
          {activeTab === Tabs.SICK && (
            <Card title="Sick Leave" subtitle="Add, edit and view records">
              {/* Add sick leave */}
              <div style={panelStyle}>
                <div style={{ fontWeight: 1000, color: UI.text, marginBottom: 10 }}>
                  Add sick leave
                </div>

                <div className={layoutStyles.extracted6}>
                  <div>
                    <div style={labelStyle}>Employee</div>
                    <select
                      value={newSick.employeeId}
                      onChange={(e) => setNewSick((s) => ({ ...s, employeeId: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">Select employee...</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || "Unnamed"}
                          {e.email ? ` (${e.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={labelStyle}>Start date</div>
                    <input
                      type="date"
                      value={newSick.startDate}
                      onChange={(e) => setNewSick((s) => ({ ...s, startDate: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <div style={labelStyle}>End date</div>
                    <input
                      type="date"
                      value={newSick.endDate}
                      onChange={(e) => setNewSick((s) => ({ ...s, endDate: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div className={layoutStyles.extracted7}>
                  <div>
                    <div style={labelStyle}>Reason</div>
                    <input
                      value={newSick.reason}
                      onChange={(e) => setNewSick((s) => ({ ...s, reason: e.target.value }))}
                      placeholder="e.g. Flu"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Notes</div>
                    <input
                      value={newSick.notes}
                      onChange={(e) => setNewSick((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Optional notes..."
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div className={layoutStyles.extracted8}>
                  <button
                    onClick={() =>
                      setNewSick({
                        employeeId: "",
                        startDate: "",
                        endDate: "",
                        reason: "",
                        notes: "",
                      })
                    }
                    style={btnStyle}
                  >
                    Clear
                  </button>
                  <button
                    onClick={addSickLeave}
                    style={{
                      ...btnStyle,
                      border: `1px solid ${UI.brand}`,
                      background: UI.brand,
                      color: "var(--color-white)",
                      fontWeight: 1000,
                    }}
                  >
                    Save sick leave
                  </button>
                </div>
              </div>

              {/* Edit sick leave */}
              {editingSick && (
                <div
                  style={{
                    ...panelStyle,
                    border: `1px solid ${UI.brand}`,
                    background: UI.brandSoft,
                  }}
                >
                  <div className={layoutStyles.extracted9}>
                    <div style={{ fontWeight: 1000, color: UI.text }}>Edit sick leave</div>
                    <div style={{ fontSize: 12, color: UI.muted }}>
                      Record: <b>{editingSick.id}</b>
                    </div>
                  </div>

                  <div className={layoutStyles.extracted10}>
                    <div>
                      <div style={labelStyle}>Employee</div>
                      <select
                        value={editingSick.employeeId}
                        onChange={(e) => setEditingSick((p) => ({ ...p, employeeId: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Select employee...</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || "Unnamed"}
                            {e.email ? ` (${e.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={labelStyle}>Start date</div>
                      <input
                        type="date"
                        value={editingSick.startDate}
                        onChange={(e) => setEditingSick((p) => ({ ...p, startDate: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>End date</div>
                      <input
                        type="date"
                        value={editingSick.endDate}
                        onChange={(e) => setEditingSick((p) => ({ ...p, endDate: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className={layoutStyles.extracted11}>
                    <div>
                      <div style={labelStyle}>Reason</div>
                      <input
                        value={editingSick.reason}
                        onChange={(e) => setEditingSick((p) => ({ ...p, reason: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Notes</div>
                      <input
                        value={editingSick.notes}
                        onChange={(e) => setEditingSick((p) => ({ ...p, notes: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className={layoutStyles.extracted12}>
                    <button onClick={cancelEditSick} style={btnStyle}>
                      Cancel
                    </button>
                    <button
                      onClick={saveEditSick}
                      disabled={savingSick}
                      style={{
                        ...btnStyle,
                        border: `1px solid ${UI.brand}`,
                        background: UI.brand,
                        color: "var(--color-white)",
                        fontWeight: 1000,
                      }}
                    >
                      {savingSick ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              )}

              {/* Records table */}
              <div className={layoutStyles.extracted13}>
                <table className={layoutStyles.extracted14}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Start</Th>
                      <Th>End</Th>
                      <Th>Days</Th>
                      <Th>Reason</Th>
                      <Th>Notes</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {sickLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={emptyTd}>
                          No sick leave records yet.
                        </td>
                      </tr>
                    ) : (
                      sickLeaves.map((s) => {
                        const emp = employees.find((e) => e.id === s.employeeId);
                        return (
                          <tr key={s.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text }}>
                                {emp?.name || "Unknown"}
                              </div>
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                {emp?.email || ""}
                              </div>
                            </Td>

                            <Td className={layoutStyles.extracted15}>{fmtYMD(s.startDate)}</Td>
                            <Td className={layoutStyles.extracted16}>{fmtYMD(s.endDate)}</Td>

                            <Td>
                              <span style={{ fontWeight: 1000, color: UI.text }}>{s.days ?? "-"}</span>
                            </Td>

                            <Td>{s.reason || "-"}</Td>
                            <Td style={{ color: UI.muted }}>{s.notes || "-"}</Td>

                            <Td>
                              <div className={layoutStyles.extracted17}>
                                <button
                                  onClick={() => startEditSick(s)}
                                  style={{
                                    ...btnStyle,
                                    border: `1px solid ${UI.brand}`,
                                    background: UI.brandSoft,
                                    color: UI.brand,
                                    fontWeight: 1000,
                                  }}
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => deleteSickLeave(s.id)}
                                  style={{
                                    ...btnStyle,
                                    border: "1px solid var(--color-danger-border)",
                                    background: "var(--color-accent-soft)",
                                    color: UI.danger,
                                    fontWeight: 1000,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {activeTab === Tabs.ACTIVITY && (
            <Card
              title="System Activity"
              subtitle="Recent activity across bookings, maintenance, holidays, sick leave and access changes."
            >
              <div
                className={layoutStyles.extracted18}
              >
                <div className={layoutStyles.extracted19}>
                  <span style={pillStyle}>Showing {filteredActivityRows.length}</span>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", color: UI.text, fontWeight: 800 }}>
                    <span>Day</span>
                    <input
                      type="date"
                      value={activityDay === "-" ? "" : activityDay}
                      onChange={(e) => setActivityDay(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                </div>
                <button onClick={fetchActivity} style={btnStyle}>
                  Refresh activity
                </button>
              </div>

              <div style={{ ...panelStyle, marginBottom: 12 }}>
                <div className={layoutStyles.extracted20}>
                  <div style={{ fontWeight: 1000, color: UI.text }}>Activity per Hour</div>
                  <span style={pillStyle}>{activityDay || "No day selected"}</span>
                </div>

                <div
                  className={layoutStyles.extracted21}
                >
                  {activityByHour.map((item) => (
                    <div key={item.hour} className={layoutStyles.extracted22}>
                      <div
                        title={`${item.label} - ${item.value} activit${item.value === 1 ? "y" : "ies"}`}
                        style={{
                          height: `${Math.max(8, (item.value / activityHourMax) * 160)}px`,
                          borderRadius: "10px 10px 4px 4px",
                          border: `1px solid ${item.value ? UI.brand : "var(--color-border)"}`,
                          background: item.value
                            ? "linear-gradient(180deg, rgba(29,78,216,0.22) 0%, rgba(29,78,216,0.82) 100%)"
                            : "var(--color-brand-soft)",
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "center",
                          color: item.value ? "var(--color-white)" : UI.muted,
                          fontSize: 11,
                          fontWeight: 900,
                          paddingTop: 6,
                        }}
                      >
                        {item.value}
                      </div>
                      <div style={{ fontSize: 10, color: UI.muted, textAlign: "center", whiteSpace: "nowrap" }}>
                        {String(item.hour).padStart(2, "0")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={layoutStyles.extracted23}
              >
                <div style={panelStyle}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    Selected Day
                  </div>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 1000, color: UI.text }}>
                    {activitySummary.total}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>activity events</div>
                </div>

                <div style={panelStyle}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    Active Users
                  </div>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 1000, color: UI.text }}>
                    {activitySummary.uniqueUsers}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>unique users on this day</div>
                </div>

                <div style={panelStyle}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                    Top Areas
                  </div>
                  {activitySummary.topAreas.length ? (
                    <div className={layoutStyles.extracted24}>
                      {activitySummary.topAreas.map(([area, count]) => (
                        <span key={area} style={pillStyle}>
                          {area}: {count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.muted }}>No activity on this day.</div>
                  )}
                </div>
              </div>

              <div className={layoutStyles.extracted25}>
                <table className={layoutStyles.extracted26}>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>User</Th>
                      <Th>Action</Th>
                      <Th>Area</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLoading ? (
                      <tr>
                        <td colSpan={5} style={emptyTd}>
                          Loading activity...
                        </td>
                      </tr>
                    ) : filteredActivityRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={emptyTd}>
                          No activity found.
                        </td>
                      </tr>
                    ) : (
                      filteredActivityRows.map((row) => (
                        <tr key={row.id} style={rowStyle}>
                                                    <Td>
                            <div style={{ fontWeight: 900, color: UI.text }}>
                              {row.at ? row.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11.5, color: UI.muted }}>
                              {row.at ? row.at.toLocaleDateString("en-GB") : "—"}
                            </div>
                          </Td>
                          <Td>
                            <div style={{ fontWeight: 800, color: UI.text }}>{row.user}</div>
                          </Td>
                          <Td>
                            <span style={pillStyle}>{row.action}</span>
                          </Td>
                                                    <Td>
                            <span
                              style={{
                                ...pillStyle,
                                background: UI.brandSoft,
                                color: UI.brand,
                                borderColor: "rgba(29, 78, 216, 0.18)",
                              }}
                            >
                              {row.area || "Other"}
                            </span>
                          </Td>
                                                    <Td>
                            <div style={{ color: UI.text }}>{row.details || "—"}</div>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {activeTab === Tabs.AUDIT && (
            <Card
              title="Admin Audit Log"
              subtitle="Security-sensitive admin actions including role changes and user enable/disable operations."
            >
              <div
                className={layoutStyles.extracted27}
              >
                <span style={pillStyle}>Showing {filteredAuditRows.length}</span>
                <button onClick={fetchAuditLogs} style={btnStyle}>
                  Refresh audit log
                </button>
              </div>

              <div className={layoutStyles.extracted28}>
                <table className={layoutStyles.extracted29}>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Admin</Th>
                      <Th>Action</Th>
                      <Th>Target</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLoading ? (
                      <tr>
                        <td colSpan={5} style={emptyTd}>
                          Loading audit log...
                        </td>
                      </tr>
                    ) : filteredAuditRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={emptyTd}>
                          No audit log entries found.
                        </td>
                      </tr>
                    ) : (
                      filteredAuditRows.map((row) => {
                        const details = row.details && typeof row.details === "object"
                          ? Object.entries(row.details)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(" | ")
                          : String(row.details || "");

                        return (
                          <tr key={row.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text }}>
                                {row.at
                                  ? row.at.toLocaleTimeString("en-GB", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "-"}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: UI.muted }}>
                                {row.at ? row.at.toLocaleDateString("en-GB") : "-"}
                              </div>
                            </Td>
                            <Td>
                              <div style={{ fontWeight: 800, color: UI.text }}>
                                {row.actorEmail || "Unknown"}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: UI.muted }}>
                                {row.actorUid || ""}
                              </div>
                            </Td>
                            <Td>
                              <span style={pillStyle}>{row.action || "Admin action"}</span>
                            </Td>
                            <Td>
                              <div style={{ fontWeight: 800, color: UI.text }}>
                                {row.targetUserId || "-"}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: UI.muted }}>
                                {row.area || "Access"}
                              </div>
                            </Td>
                            <Td>
                              <div style={{ color: UI.text }}>{details || "-"}</div>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {showAprilFools && activeTab === Tabs.APRIL_FOOLS && (
            <div
              className={layoutStyles.extracted30}
            >
              <div
                className={layoutStyles.extracted31}
              >
                <div>
                  <div className={layoutStyles.extracted32}>
                    Critical Incident Console
                  </div>
                  <div className={layoutStyles.extracted33}>
                    Bickers Systems Compromised
                  </div>
                  <div className={layoutStyles.extracted34}>
                    Internal admin access revoked. Payroll geese now in control.
                  </div>
                </div>

                <div className={layoutStyles.extracted35}>
                  <button
                    onClick={() => setSystemRecovered(true)}
                    style={{
                      ...btnStyle,
                      border: "1px solid var(--color-success-accent)",
                      background: "var(--color-success)",
                      color: "var(--color-success-soft)",
                      fontWeight: 1000,
                    }}
                  >
                    Restore systems
                  </button>
                  <button
                    onClick={() => setActiveTab(Tabs.ACCESS)}
                    style={{
                      ...btnStyle,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "var(--color-surface-subtle)",
                    }}
                  >
                    Exit prank
                  </button>
                </div>
              </div>

              <div className={layoutStyles.extracted36}>
                <div
                  className={layoutStyles.extracted37}
                >
                  {[
                    { label: "Threat level", value: systemRecovered ? "Contained" : "Maximum nonsense" },
                    { label: "Main server", value: systemRecovered ? "Recovered" : "Running on vibes" },
                    { label: "Workshop data", value: systemRecovered ? "Safe" : "Now named goose.db" },
                    { label: "Invoice engine", value: systemRecovered ? "Recovered" : "Held for biscuits" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={layoutStyles.extracted38}
                    >
                      <div className={layoutStyles.extracted39}>
                        {item.label}
                      </div>
                      <div className={layoutStyles.extracted40}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className={layoutStyles.extracted41}
                >
                  <div
                    className={layoutStyles.extracted42}
                  >
                    <div className={layoutStyles.extracted43}>
                      Live breach feed
                    </div>
                    <div className={layoutStyles.extracted44}>
                      {aprilFoolsFeed.map((line, index) => (
                        <div key={line} style={{ color: index % 2 === 0 ? "var(--color-success-soft)" : "var(--color-success-border)" }}>
                          [{String(8 + index).padStart(2, "0")}:{String((index * 7) % 60).padStart(2, "0")}:14] {line}
                        </div>
                      ))}
                      <div style={{ color: systemRecovered ? "var(--color-success-border)" : "var(--color-danger-border)", marginTop: 6 }}>
                        {systemRecovered
                          ? "[09:12:00] Recovery complete. April Fools."
                          : "[09:11:52] Suggestion: press 'Restore systems' before Finance notices."}
                      </div>
                    </div>
                  </div>

                  <div
                    className={layoutStyles.extracted45}
                  >
                    <div className={layoutStyles.extracted46}>
                      Recovery status
                    </div>
                    <div className={layoutStyles.extracted47}>
                      <FakeMeter label="Booking core" value={systemRecovered ? 100 : 13} />
                      <FakeMeter label="Holiday service" value={systemRecovered ? 100 : 41} />
                      <FakeMeter label="Workshop grid" value={systemRecovered ? 100 : 27} />
                      <FakeMeter label="Tea protocol" value={systemRecovered ? 100 : 2} />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px dashed rgba(134,239,172,0.32)",
                    borderRadius: 16,
                    padding: 16,
                    background: systemRecovered ? "rgba(20,83,45,0.35)" : "rgba(127,29,29,0.22)",
                    color: systemRecovered ? "var(--color-success-soft)" : "var(--color-accent-soft)",
                    fontSize: 15,
                    fontWeight: 900,
                  }}
                >
                  {systemRecovered
                    ? "Systems restored. Nobody was hacked. Happy April Fools."
                    : "This is a prank screen for April 1. Nothing is actually wrong, but it does look dramatic."}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, color: UI.muted, fontSize: 12 }}>
          Collections expected: <code>users</code>, <code>employees</code>, <code>holidays</code>,{" "}
          <code>sickLeave</code>, <code>bookings</code>, <code>maintenanceBookings</code>, <code>maintenanceJobs</code>.
          (Legacy optional: <code>holidayAllowances</code>)
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* -------------------------------------------
   UI bits
------------------------------------------- */
function Card({ title, subtitle, children }) {
  return (
    <div
      style={cardStyle}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>{subtitle}</div>}
      </div>
      <div className={layoutStyles.extracted48}>{children}</div>
    </div>
  );
}

function AdminStat({ icon, label, value, detail }) {
  return (
    <div style={statCard}>
      <span style={iconBox}>{icon}</span>
      <div>
        <div style={statLabel}>{label}</div>
        <div style={statValue}>{value}</div>
        <div style={statDetail}>{detail}</div>
      </div>
    </div>
  );
}

function FakeMeter({ label, value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const tone =
    safeValue >= 100 ? "var(--color-success-accent)" : safeValue >= 50 ? "var(--color-accent)" : "var(--color-danger)";

  return (
    <div className={layoutStyles.extracted49}>
      <div
        className={layoutStyles.extracted50}
      >
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div
        className={layoutStyles.extracted51}
      >
        <div
          style={{
            width: `${safeValue}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${tone} 0%, var(--color-success-border) 100%)`,
            transition: "width 240ms ease",
          }}
        />
      </div>
    </div>
  );
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, style }) {
  return <td style={{ ...tdStyle, ...(style || {}) }}>{children}</td>;
}

/* ----------------------------------------------------------------
   Holiday Allowances Tab (Employees collection + Holidays usage)
---------------------------------------------------------------- */
const HA_thisYear = new Date().getFullYear();
const HA_nextYear = HA_thisYear + 1;

const HA_MAX_CARRY = 5;
const HA_DEFAULT_PATTERN = "full_time";

// Base entitlement rules (Full time = 22)
const HA_BASE_FULL_TIME = 22;
const HA_ENTITLEMENT = {
  full_time: HA_BASE_FULL_TIME,
  four_days: HA_BASE_FULL_TIME * (4 / 5),
  three_days: HA_BASE_FULL_TIME * (3 / 5),
};

const HA_PATTERN_LABEL = {
  full_time: "Full time",
  four_days: "4 days / week",
  three_days: "3 days / week",
};

function HA_entitlementFor(pattern) {
  const v = HA_ENTITLEMENT[pattern] ?? HA_ENTITLEMENT.full_time;
  return Math.round(v);
}

function HA_countWeekdays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function HA_pickName(x = {}) {
  return x.name || x.fullName || x.employee || x.employeeName || x.displayName || "";
}

const HA_asNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const HA_clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function HA_balanceTone(bal) {
  if (bal < 0) return "bad";
  if (bal <= 2) return "warn";
  return "good";
}

function HA_Pill({ tone = "default", children }) {
  const tones = {
    default: { bg: "var(--color-canvas)", fg: "var(--color-text)", br: "var(--color-border)" },
    good: { bg: "var(--color-success-soft)", fg: "var(--color-success)", br: "var(--color-success-border)" },
    warn: { bg: "var(--color-warning-soft)", fg: "var(--color-danger-hover)", br: "var(--color-warning-border)" },
    bad: { bg: "var(--color-accent-soft)", fg: "var(--color-danger-hover)", br: "var(--color-danger-border)" },
    info: { bg: UI.brandSoft, fg: UI.brand, br: "var(--color-brand-soft)" },
    gray: { bg: "var(--color-border)", fg: "var(--color-text-muted)", br: "var(--color-border)" },
  };
  const t = tones[tone] || tones.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.br}`,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function HA_StatTile({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "var(--color-white)", br: "var(--color-border)" },
    soft: { bg: UI.brandSoft, br: "var(--color-brand-soft)" },
    warn: { bg: "var(--color-warning-soft)", br: "var(--color-warning-border)" },
  };
  const t = tones[tone] || tones.default;
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.br}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, color: UI.text }}>{value}</div>
    </div>
  );
}

function EmployeesHolidayAllowancesTab() {
  const [loading, setLoading] = useState(true);
  const [yearView, setYearView] = useState(HA_thisYear);

  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});
  const [usedByYearName, setUsedByYearName] = useState({});
  const [q, setQ] = useState("");

  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState(HA_DEFAULT_PATTERN);
  const [newCarry, setNewCarry] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const overview = await fetchAdminOverviewDataFromServer();
        const list = (overview.employees || []).map((employee) => {
          const x = employee || {};
          const pattern = x.workPattern || HA_DEFAULT_PATTERN;
          return {
            id: x.id,
            name: HA_pickName(x),
            workPattern: pattern,
            holidayAllowance: HA_asNum(x.holidayAllowance, HA_entitlementFor(pattern)),
            carriedOverDays: HA_asNum(x.carriedOverDays, 0),
            holidayAllowances: x.holidayAllowances || {},
            carryOverByYear: x.carryOverByYear || {},
          };
        });

        const holidays = overview.holidays || [];
        const used = { [HA_thisYear]: {}, [HA_nextYear]: {} };

        holidays.forEach((holiday) => {
          const x = holiday || {};
          const name = x.employee;
          if (!name || !x.startDate || !x.endDate) return;

          //  can be string OR Timestamp
          const start = toDateSafe(x.startDate);
          const end = toDateSafe(x.endDate);
          if (!start || !end) return;

          if (start.getFullYear() !== end.getFullYear()) return;
          const yr = start.getFullYear();
          if (yr !== HA_thisYear && yr !== HA_nextYear) return;

          const days = HA_countWeekdays(start, end);
          used[yr][name] = (used[yr][name] || 0) + days;
        });

        setRows(list);
        setUsedByYearName(used);

        const seed = {};
        for (const r of list) {
          const pattern = r.workPattern || HA_DEFAULT_PATTERN;
          const base = HA_entitlementFor(pattern);

          const allowThis =
            r.holidayAllowances?.[String(HA_thisYear)] !== undefined
              ? HA_asNum(r.holidayAllowances[String(HA_thisYear)], base)
              : HA_asNum(r.holidayAllowance, base);

          const carryThis =
            r.carryOverByYear?.[String(HA_thisYear)] !== undefined
              ? HA_asNum(r.carryOverByYear[String(HA_thisYear)], 0)
              : HA_asNum(r.carriedOverDays, 0);

          const allowNext =
            r.holidayAllowances?.[String(HA_nextYear)] !== undefined
              ? HA_asNum(r.holidayAllowances[String(HA_nextYear)], base)
              : base;

          const storedNextCarry =
            r.carryOverByYear?.[String(HA_nextYear)] !== undefined
              ? HA_asNum(r.carryOverByYear[String(HA_nextYear)], 0)
              : undefined;

          const usedThis = used[HA_thisYear]?.[r.name] || 0;
          const balThis = allowThis + carryThis - usedThis;
          const autoNextCarry = HA_clamp(balThis, 0, HA_MAX_CARRY);

          seed[r.id] = {
            name: r.name,
            workPattern: pattern,
            byYear: {
              [HA_thisYear]: {
                holidayAllowance: allowThis,
                carriedOverDays: carryThis,
              },
              [HA_nextYear]: {
                holidayAllowance: allowNext,
                carriedOverDays:
                  storedNextCarry !== undefined ? HA_clamp(storedNextCarry, 0, HA_MAX_CARRY) : autoNextCarry,
              },
            },
          };
        }
        setEdits(seed);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(term));
  }, [rows, q]);

  const usedForYearByName = useCallback(
    (yr, name) => usedByYearName?.[yr]?.[name] || 0,
    [usedByYearName]
  );

  const getPattern = useCallback(
    (r) => edits?.[r.id]?.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN,
    [edits]
  );

  const getAllowanceForYear = useCallback((r, yr) => {
    const pattern = getPattern(r);
    const fallback = HA_entitlementFor(pattern);

    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.holidayAllowance !== undefined) return HA_asNum(slot.holidayAllowance, fallback);

    const mapVal = r.holidayAllowances?.[String(yr)];
    if (mapVal !== undefined) return HA_asNum(mapVal, fallback);

    return HA_asNum(r.holidayAllowance, fallback);
  }, [edits, getPattern]);

  const getCarryForYear = useCallback((r, yr) => {
    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.carriedOverDays !== undefined) return HA_asNum(slot.carriedOverDays, 0);

    const mapVal = r.carryOverByYear?.[String(yr)];
    if (mapVal !== undefined) return HA_asNum(mapVal, 0);

    return HA_asNum(r.carriedOverDays, 0);
  }, [edits]);

  const balanceForYear = (r, yr) => {
    const allowance = getAllowanceForYear(r, yr);
    const carry = getCarryForYear(r, yr);
    const used = usedForYearByName(yr, r.name);
    return allowance + carry - used;
  };

  const onEditName = (id, val) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), name: val } }));

  const onEditPattern = (r, pattern) => {
    const id = r.id;
    const derived = HA_entitlementFor(pattern);

    setEdits((p) => {
      const prev = p[id] || {};
      const byYear = { ...(prev.byYear || {}) };

      byYear[HA_thisYear] = { ...(byYear[HA_thisYear] || {}), holidayAllowance: derived };
      byYear[HA_nextYear] = { ...(byYear[HA_nextYear] || {}), holidayAllowance: derived };

      return { ...p, [id]: { ...prev, workPattern: pattern, byYear } };
    });
  };

  const onEditAllowance = (id, val) => {
    const yr = yearView;
    setEdits((p) => ({
      ...p,
      [id]: {
        ...(p[id] || {}),
        byYear: {
          ...((p[id] || {}).byYear || {}),
          [yr]: {
            ...(((p[id] || {}).byYear || {})[yr] || {}),
            holidayAllowance: HA_asNum(val, 0),
          },
        },
      },
    }));
  };

  const onEditCarry = (r, val) => {
    const yr = yearView;
    let nextVal = HA_asNum(val, 0);

    if (yr === HA_nextYear) nextVal = HA_clamp(nextVal, 0, HA_MAX_CARRY);
    else nextVal = Math.max(0, nextVal);

    setEdits((p) => ({
      ...p,
      [r.id]: {
        ...(p[r.id] || {}),
        byYear: {
          ...((p[r.id] || {}).byYear || {}),
          [yr]: {
            ...(((p[r.id] || {}).byYear || {})[yr] || {}),
            carriedOverDays: nextVal,
          },
        },
      },
    }));
  };

  const saveRow = async (r) => {
    const e = edits?.[r.id] || {};
    const name = (e.name ?? r.name ?? "").trim();
    const pattern = e.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN;

    if (!name) return alert("Name is required.");

    const allowance = getAllowanceForYear(r, yearView);
    const carry = getCarryForYear(r, yearView);

    if (allowance < 0 || carry < 0) return alert("Numbers must be >= 0.");
    if (yearView === HA_nextYear && carry > HA_MAX_CARRY) return alert(`Carry over cannot exceed ${HA_MAX_CARRY} days.`);

    const yrKey = String(yearView);

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      const nextAllowances = { ...(r.holidayAllowances || {}), [yrKey]: allowance };
      const nextCarry = { ...(r.carryOverByYear || {}), [yrKey]: carry };

      const legacyPatch = yearView === HA_thisYear ? { holidayAllowance: allowance, carriedOverDays: carry } : {};

      await updateDoc(doc(db, "employees", r.id), {
        name,
        fullName: name,
        employeeName: name,
        workPattern: pattern,
        holidayAllowances: nextAllowances,
        carryOverByYear: nextCarry,
        ...legacyPatch,
      });

      setRows((list) =>
        list.map((row) =>
          row.id === r.id
            ? {
                ...row,
                name,
                workPattern: pattern,
                holidayAllowances: nextAllowances,
                carryOverByYear: nextCarry,
                ...(yearView === HA_thisYear ? { holidayAllowance: allowance, carriedOverDays: carry } : {}),
              }
            : row
        )
      );

      alert(`Saved ${name} (${yearView}).`);
    } catch (err) {
      alert(`Failed to save: ${err?.message || err}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  const deleteRow = async (r) => {
    if (!confirm(`Delete employee "${r.name}"?`)) return;

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      await deleteDoc(doc(db, "employees", r.id));

      setRows((list) => list.filter((x) => x.id !== r.id));
      setEdits((p) => {
        const cp = { ...p };
        delete cp[r.id];
        return cp;
      });

      alert("Deleted.");
    } catch (err) {
      alert(`Failed to delete: ${err?.message || err}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  const addEmployee = async () => {
    const name = (newName || "").trim();
    const pattern = newPattern || HA_DEFAULT_PATTERN;
    if (!name) return alert("Name is required.");

    const allowance = HA_entitlementFor(pattern);
    const carry = Math.max(0, HA_asNum(newCarry, 0));

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "employees"), tenantPayload(dataAccessState, {
        name,
        fullName: name,
        employeeName: name,
        workPattern: pattern,
        holidayAllowance: allowance,
        carriedOverDays: carry,
        holidayAllowances: { [String(HA_thisYear)]: allowance },
        carryOverByYear: { [String(HA_thisYear)]: carry },
      }));

      const newRow = {
        id: docRef.id,
        name,
        workPattern: pattern,
        holidayAllowance: allowance,
        carriedOverDays: carry,
        holidayAllowances: { [String(HA_thisYear)]: allowance },
        carryOverByYear: { [String(HA_thisYear)]: carry },
      };

      setRows((l) => [newRow, ...l]);
      setEdits((p) => ({
        ...p,
        [docRef.id]: {
          name,
          workPattern: pattern,
          byYear: {
            [HA_thisYear]: { holidayAllowance: allowance, carriedOverDays: carry },
            [HA_nextYear]: { holidayAllowance: allowance, carriedOverDays: 0 },
          },
        },
      }));

      setNewName("");
      setNewPattern(HA_DEFAULT_PATTERN);
      setNewCarry(0);

      alert("Employee added.");
    } catch (err) {
      handleFirestoreAccessError(err, { collectionName: "employees", operation: "create employee" });
      alert(`Failed to add: ${err?.message || err}`);
    } finally {
      setAdding(false);
    }
  };

  const kpis = useMemo(() => {
    const totalPeople = filteredRows.length;
    let totalAllowance = 0;
    let totalCarry = 0;
    let totalUsed = 0;

    filteredRows.forEach((r) => {
      totalAllowance += getAllowanceForYear(r, yearView);
      totalCarry += getCarryForYear(r, yearView);
      totalUsed += usedForYearByName(yearView, r.name);
    });

    const total = totalAllowance + totalCarry;
    const totalBalance = total - totalUsed;

    return {
      people: totalPeople,
      totalAllowance: Number(totalAllowance.toFixed(0)),
      totalCarry: Number(totalCarry.toFixed(0)),
      totalUsed: Number(totalUsed.toFixed(0)),
      totalBalance: Number(totalBalance.toFixed(0)),
    };
  }, [filteredRows, yearView, getAllowanceForYear, getCarryForYear, usedForYearByName]);

  return (
    <Card
      title="Employees - Holiday Allowances"
      subtitle={`Work pattern sets base allowance (FT = ${HA_BASE_FULL_TIME}). Carry into next year capped at ${HA_MAX_CARRY}.`}
    >
      {/* Controls */}
      <div className={layoutStyles.extracted52}>
        <div className={layoutStyles.extracted53}>
          <span style={pillStyle}>Viewing: {yearView}</span>
          <select value={yearView} onChange={(e) => setYearView(Number(e.target.value))} style={selectStyle}>
            <option value={HA_thisYear}>{HA_thisYear} (Current)</option>
            <option value={HA_nextYear}>{HA_nextYear} (Next)</option>
          </select>
        </div>

        <div className={layoutStyles.extracted54}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees..." style={topSearchStyle} />
          <span style={{ color: UI.muted, fontSize: 12 }}>
            Showing <b>{filteredRows.length}</b>
          </span>
        </div>
      </div>

      {/* Add employee */}
      <div style={{ ...panelStyle, marginTop: 12 }}>
        <div className={layoutStyles.extracted55}>
          <div style={{ fontWeight: 1000, color: UI.text }}>Add employee</div>
          <HA_Pill tone="info">Base: {HA_entitlementFor(newPattern)} days</HA_Pill>
        </div>

        <div className={layoutStyles.extracted56}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={inputStyle} />
          <select value={newPattern} onChange={(e) => setNewPattern(e.target.value)} style={selectStyle}>
            <option value="full_time">{HA_PATTERN_LABEL.full_time}</option>
            <option value="four_days">{HA_PATTERN_LABEL.four_days}</option>
            <option value="three_days">{HA_PATTERN_LABEL.three_days}</option>
          </select>
          <input
            type="number"
            min={0}
            value={newCarry}
            onChange={(e) => setNewCarry(e.target.value)}
            placeholder={`Carry (${HA_thisYear})`}
            style={cellInputStyle}
          />
          <button
            onClick={addEmployee}
            disabled={adding}
            style={{ ...btnStyle, border: `1px solid ${UI.brand}`, background: UI.brand, color: "var(--color-surface)", fontWeight: 1000 }}
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className={layoutStyles.extracted57}>
        <HA_StatTile label="People" value={kpis.people} tone="soft" />
        <HA_StatTile label="Used" value={kpis.totalUsed} />
        <HA_StatTile label="Allowance" value={kpis.totalAllowance} />
        <HA_StatTile label="Carry" value={kpis.totalCarry} tone="warn" />
        <div className={layoutStyles.extracted58}>
          <HA_StatTile
            label="Total balance"
            value={kpis.totalBalance}
            tone={kpis.totalBalance < 0 ? "warn" : "soft"}
          />
        </div>
      </div>

      {/* Table */}
      <div className={layoutStyles.extracted59}>
        <table className={layoutStyles.extracted60}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Work Pattern</Th>
              <Th>Allowance</Th>
              <Th>Carry</Th>
              <Th>Total</Th>
              <Th>Used</Th>
              <Th>Balance</Th>
              <Th>Actions</Th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={emptyTd}>
                  Loading...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={emptyTd}>
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, idx) => {
                const e = edits?.[r.id] || {};
                const name = e.name ?? r.name;

                const pattern = e.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN;
                const allowance = getAllowanceForYear(r, yearView);
                const carry = getCarryForYear(r, yearView);
                const used = usedForYearByName(yearView, r.name);

                const total = allowance + carry;
                const balance = total - used;

                const balThis = balanceForYear(r, HA_thisYear);
                const recommendedCarry = HA_clamp(balThis, 0, HA_MAX_CARRY);

                return (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-subtle)" }}>
                    <Td>
                      <input
                        value={name}
                        onChange={(ev) => onEditName(r.id, ev.target.value)}
                        style={{ ...inputStyle, minWidth: 220 }}
                      />
                    </Td>

                    <Td>
                      <select value={pattern} onChange={(ev) => onEditPattern(r, ev.target.value)} style={selectStyle}>
                        <option value="full_time">{HA_PATTERN_LABEL.full_time}</option>
                        <option value="four_days">{HA_PATTERN_LABEL.four_days}</option>
                        <option value="three_days">{HA_PATTERN_LABEL.three_days}</option>
                      </select>

                      <div className={layoutStyles.extracted61}>
                        <HA_Pill tone="gray">Base {HA_entitlementFor(pattern)}</HA_Pill>
                        {pattern !== "full_time" ? <HA_Pill tone="info">Pro-rata</HA_Pill> : <HA_Pill tone="good">FT</HA_Pill>}
                      </div>
                    </Td>

                    <Td>
                      <input
                        type="number"
                        min={0}
                        value={allowance}
                        onChange={(ev) => onEditAllowance(r.id, ev.target.value)}
                        style={cellInputStyle}
                      />
                    </Td>

                    <Td>
                      <div className={layoutStyles.extracted62}>
                        <input
                          type="number"
                          min={0}
                          max={yearView === HA_nextYear ? HA_MAX_CARRY : undefined}
                          value={carry}
                          onChange={(ev) => onEditCarry(r, ev.target.value)}
                          style={cellInputStyle}
                        />
                        {yearView === HA_nextYear ? (
                          <div style={{ fontSize: 12, color: UI.muted }}>
                            Recommended (from {HA_thisYear} balance): <b>{recommendedCarry}</b> - {HA_thisYear} bal: <b>{balThis}</b>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: UI.muted }}>Current-year carry</div>
                        )}
                      </div>
                    </Td>

                    <Td>
                      <HA_Pill tone="info">{total}</HA_Pill>
                    </Td>
                    <Td>
                      <HA_Pill tone="gray">{used}</HA_Pill>
                    </Td>
                    <Td>
                      <HA_Pill tone={HA_balanceTone(balance)}>{balance}</HA_Pill>
                    </Td>

                    <Td>
                      <div className={layoutStyles.extracted63}>
                        <button
                          onClick={() => saveRow(r)}
                          disabled={!!saving[r.id]}
                          style={{ ...btnStyle, border: `1px solid ${UI.brand}`, background: UI.brand, color: "var(--color-surface)", fontWeight: 1000 }}
                        >
                          {saving[r.id] ? "Saving..." : `Save (${yearView})`}
                        </button>

                        <button
                          onClick={() => deleteRow(r)}
                          disabled={!!saving[r.id]}
                          style={{ ...btnStyle, border: "1px solid var(--color-danger-border)", background: "var(--color-accent-soft)", color: UI.danger, fontWeight: 1000 }}
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, color: UI.muted, fontSize: 12, lineHeight: 1.55 }}>
        Tip: &quot;Used&quot; is calculated from the <code>holidays</code> collection (Mon-Fri only). Ensure{" "}
        <code>holidays.employee</code> matches the employee <code>name</code> exactly.
      </div>
    </Card>
  );
}

/* -------------------------------------------
   Styles
------------------------------------------- */
const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const pageHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: UI.gap,
  flexWrap: "wrap",
};

const h1Style = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 800,
  color: UI.text,
  letterSpacing: 0,
};

const pageSub = {
  color: UI.muted,
  marginTop: 6,
  fontSize: 13.5,
  lineHeight: 1.45,
};

const headerActions = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: 360,
  maxWidth: "80vw",
  padding: "0 10px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: UI.card,
  boxShadow: UI.shadowSm,
};

const headerSearchInputStyle = {
  width: "100%",
  minWidth: 0,
  height: 34,
  padding: "7px 0",
  border: 0,
  outline: "none",
  background: "transparent",
  fontWeight: 700,
  fontSize: 13,
  color: UI.text,
};

const statGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: UI.gap,
  marginTop: 12,
};

const cardStyle = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 12,
};

const statCard = {
  ...cardStyle,
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};

const iconBox = {
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: UI.brandSoft,
  color: UI.brand,
  border: `1px solid ${UI.brandBorder}`,
  flex: "0 0 auto",
};

const statLabel = {
  fontSize: 11,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const statValue = {
  marginTop: 4,
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 900,
  color: UI.text,
};

const statDetail = {
  marginTop: 5,
  color: UI.muted,
  fontSize: 12,
};

const tabBar = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thStyle = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: UI.border,
  fontSize: 12,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  background: "var(--color-surface-subtle)",
};

const tdStyle = {
  padding: "9px 10px",
  borderBottom: UI.border,
  verticalAlign: "middle",
  color: UI.text,
  fontSize: 13.5,
};

const emptyTd = { padding: 12, color: UI.muted };

const btnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.card,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: UI.text,
  boxShadow: UI.shadowSm,
};

const topSearchStyle = {
  width: 320,
  maxWidth: "80vw",
  padding: "8px 10px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 700,
  fontSize: 13,
  color: UI.text,
  boxShadow: UI.shadowSm,
};

const pillStyle = {
  marginLeft: 8,
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontWeight: 900,
};

const selectStyle = {
  padding: "7px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: UI.card,
  fontWeight: 800,
  color: UI.text,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 800,
  fontSize: 13,
  color: UI.text,
};

const cellInputStyle = {
  width: 110,
  maxWidth: "100%",
  padding: "7px 9px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 900,
  color: UI.text,
};

const panelStyle = {
  border: UI.border,
  borderRadius: UI.radius,
  background: "var(--color-surface-subtle)",
  padding: 12,
  marginBottom: 12,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
};

const rowStyle = { background: UI.card };
