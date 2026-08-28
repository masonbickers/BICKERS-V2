"use client";

import layoutStyles from "./HeaderSidebarLayout.styles.module.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { BUILD_INFO } from "@/app/generated/buildInfo";
import { getDocs, limit, onSnapshot, where } from "firebase/firestore";
import { db } from "@/app/utils/firebaseClient";
import {
  getRoleDefinition,
  getStoredActiveWorkspace,
  getWorkspaceForPath,
  hasFinanceAccess,
  isAdminPath,
  isFinancePath,
  isModuleEnabledForPath,
  normalizePlatformRole,
  selectLandingRoute,
  setStoredActiveWorkspace,
} from "@/app/utils/accessControl";
import {
  clearPagePermissionDenied,
  PAGE_PERMISSION_CLEAR_EVENT,
  PAGE_PERMISSION_DENIED_EVENT,
} from "@/app/utils/pageAccessEvents";
import {
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
} from "@/app/utils/firestoreAccess";
import { useAuth } from "@/app/context/authContext";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { DEFAULT_GLOBAL_THEME } from "@/app/utils/globalTheme";
import { useContentLabels } from "@/app/components/ContentLabelsProvider";
import { Button, Modal, Select } from "@/app/components/ui";
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ContactRound,
  FileText,
  Home,
  ListChecks,
  ListTree,
  LogOut,
  Menu,
  MessageSquareText,
  Monitor,
  Moon,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  UNSAVED_CHANGES_EVENT,
  UNSAVED_NAVIGATION_REQUEST_EVENT,
  bypassUnsavedChangesOnce,
  getUnsavedChangesState,
  shouldBypassUnsavedChanges,
} from "@/app/utils/unsavedChanges";
import { getHolidayApprovalQueueCounts } from "@/app/utils/holidayApprovalQueue";
import { shouldShowShellBackButton } from "@/app/utils/shellNavigation";

const APP_VERSION_LABEL = BUILD_INFO.shortCommit
  ? `${BUILD_INFO.version} · ${BUILD_INFO.shortCommit}`
  : BUILD_INFO.version;
const CALENDAR_ACCESS_OPTIONS = { requireCompany: false, signedInWide: true };
const SIDEBAR_PREFERENCE_KEY = "bickers-sidebar:v1";
const PersistentShellContext = createContext(null);

const GLOBAL_SEARCH_PAGE_ITEMS = [
  { label: "Create Booking", path: "/create-booking", Icon: CalendarDays, keywords: "add new booking job" },
  { label: "Create Enquiry", path: "/create-enquiry", Icon: MessageSquareText, keywords: "add new enquiry" },
  { label: "Job Sheet", path: "/job-sheet", Icon: ClipboardList, keywords: "jobs bookings work" },
  { label: "Finance Queue", path: "/finance-queue", Icon: BadgePoundSterling, keywords: "ready invoice pricing" },
  { label: "Invoiced Jobs", path: "/invoiced", Icon: Receipt, keywords: "issued invoices finance" },
  { label: "Paid Jobs", path: "/paid", Icon: Receipt, keywords: "settled payment finance" },
  { label: "Completed Quotes", path: "/completed-quotes", Icon: FileText, keywords: "quotes saved" },
  { label: "Employees", path: "/employees", Icon: Users, keywords: "staff people crew" },
  { label: "Timesheets", path: "/timesheets", Icon: Clock3, keywords: "hours staff payroll" },
  { label: "Holiday Usage", path: "/holiday-usage", Icon: CalendarDays, keywords: "leave hr allowance" },
  { label: "Vehicles", path: "/vehicles", Icon: CarFront, keywords: "fleet register registration" },
  { label: "Equipment", path: "/equipment", Icon: ListTree, keywords: "assets kit fleet" },
  { label: "Vehicle Checks", path: "/vehicle-checks", Icon: ListChecks, keywords: "defects inspections" },
  { label: "Maintenance Jobs", path: "/maintenance-jobs", Icon: Wrench, keywords: "workshop repairs" },
  { label: "MOT Overview", path: "/mot-overview", Icon: CarFront, keywords: "compliance expiry" },
  { label: "Service Overview", path: "/service-overview", Icon: Wrench, keywords: "maintenance due" },
  { label: "Usage Overview", path: "/usage-overview", Icon: ChartNoAxesCombined, keywords: "vehicle utilisation" },
  { label: "Prep Dashboard", path: "/preplist-dashboard", Icon: ClipboardList, keywords: "vehicle preparation jobs" },
  { label: "Stunt Prep", path: "/stunt-prep", Icon: Wrench, keywords: "preparation jobs" },
  { label: "Settings", path: "/settings", Icon: Settings, keywords: "preferences account appearance" },
  { label: "Admin", path: "/admin", Icon: ShieldCheck, keywords: "users access appearance system" },
];

const globalSearchText = (...values) =>
  values.flat(Infinity).filter(Boolean).map((value) => String(value).trim()).filter(Boolean).join(" ");
const globalSearchDomId = (id) => `search-${String(id || "result").replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const dedupeViewAsUsers = (rows = []) => {
  const byIdentity = new Map();

  rows.forEach((row) => {
    if (row?.isEnabled === false) return;

    const email = String(row?.email || "").trim().toLowerCase();
    const id = String(row?.uid || row?.id || "").trim();
    const key = email ? `email:${email}` : `id:${id}`;
    if (!id || key === "id:") return;

    const current = byIdentity.get(key);
    const name = String(row?.name || "").trim();
    const hasUsefulName = Boolean(name && name.toLowerCase() !== email);
    const currentName = String(current?.name || "").trim();
    const currentHasUsefulName = Boolean(currentName && currentName.toLowerCase() !== email);

    if (!current || (hasUsefulName && !currentHasUsefulName)) {
      byIdentity.set(key, row);
    }
  });

  return Array.from(byIdentity.values()).sort((a, b) =>
    String(a?.name || a?.email || "").localeCompare(String(b?.name || b?.email || ""))
  );
};

function SearchHighlight({ children, query }) {
  const value = String(children || "");
  const terms = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (!value || !terms.length) return value;

  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escapedTerms.join("|")})`, "ig");

  return value.split(matcher).map((part, index) =>
    terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? (
      <mark key={`${part}:${index}`}>{part}</mark>
    ) : (
      part
    )
  );
}

function UCraneIcon({ size = 24, className = "", "aria-hidden": ariaHidden }) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={`${layoutStyles.uCraneIcon} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

function displayNameFromAccount(user, userDoc = {}) {
  return (
    userDoc?.name ||
    userDoc?.displayName ||
    userDoc?.fullName ||
    user?.displayName ||
    userDoc?.email ||
    user?.email ||
    "User"
  );
}

function initialsFromAccount(user, userDoc = {}) {
  const displayName = displayNameFromAccount(user, userDoc);
  const email = String(userDoc?.email || user?.email || "").trim();
  const source = String(displayName || email || "User").trim();
  const parts = source.includes("@")
    ? [source.split("@")[0]]
    : source.split(/\s+/).filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "U";
}

function accessLabelForAccount(userDoc = {}, isAdmin) {
  const fallbackRole = isAdmin ? "admin" : "user";
  const normalizedRole = normalizePlatformRole(userDoc?.role || fallbackRole);
  const effectiveRole = isAdmin && normalizedRole === "user" ? "admin" : normalizedRole;
  return getRoleDefinition(effectiveRole).label;
}

function resolvePageAccessStatus({
  canSeePlatformAdmin,
  isAdmin,
  pathname,
  user,
  userDoc,
}) {
  const path = pathname || "/";
  const platformAdminPath = path === "/platform-admin" || path.startsWith("/platform-admin/");

  if (!user) {
    return { status: "denied", label: "Denied", detail: "User is not signed in." };
  }

  if (userDoc?.isEnabled === false) {
    return { status: "denied", label: "Denied", detail: "User account is disabled." };
  }

  if (platformAdminPath && !canSeePlatformAdmin) {
    return { status: "denied", label: "Denied", detail: "Platform Admin access is required." };
  }

  if (isAdminPath(path) && !isAdmin) {
    return { status: "denied", label: "Denied", detail: "Admin access is required." };
  }

  return { status: "authorised", label: "Authorised", detail: "This user can access this page." };
}

export default function HeaderSidebarLayout(props) {
  const persistentShell = useContext(PersistentShellContext);

  if (persistentShell) {
    return <NestedShellPreferences persistentShell={persistentShell} {...props} />;
  }

  return <HeaderSidebarLayoutInner {...props} />;
}

function NestedShellPreferences({ children, showBackButton, persistentShell }) {
  useLayoutEffect(() => {
    if (typeof showBackButton !== "boolean") return undefined;
    persistentShell.setNestedBackButtonOverride(showBackButton);
    return () => persistentShell.setNestedBackButtonOverride(undefined);
  }, [persistentShell, showBackButton]);

  return <>{children}</>;
}

function HeaderSidebarLayoutInner({
  children,
  showBackButton,
  backHref,
  backLabel = "Back",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const appearance = useAppearance();
  const [nestedBackButtonOverride, setNestedBackButtonOverride] = useState(undefined);
  const persistentShell = useMemo(() => ({ setNestedBackButtonOverride }), []);
  const { label: contentLabel } = useContentLabels();
  const {
    user,
    realUser,
    userDoc,
    employeeAccess,
    featureFlags,
    isAdmin,
    isEnabled,
    accessReady,
    logout,
    canUseAdminViewSwitch,
    adminViewMode,
    setAdminViewMode,
    adminViewUserId,
    setAdminViewUser,
  } = useAuth() || {};

  const [showMenu, setShowMenu] = useState(false); // (kept)
  const [activeWorkspace, setActiveWorkspace] = useState("user");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const [globalSearchRecords, setGlobalSearchRecords] = useState([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchLoaded, setGlobalSearchLoaded] = useState(false);
  const [globalSearchLoadReady, setGlobalSearchLoadReady] = useState(false);
  const [globalSearchUnavailableTypes, setGlobalSearchUnavailableTypes] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({
    Operations: true,
    "People & Fleet": true,
    Business: true,
  });
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [permissionIssue, setPermissionIssue] = useState(null);
  const [viewAsUsers, setViewAsUsers] = useState([]);
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const [viewAsError, setViewAsError] = useState("");
  const [viewAsReloadKey, setViewAsReloadKey] = useState(0);

  //  HR notification state
  const [hrNotif, setHrNotif] = useState({ requests: 0, deletes: 0 });
  const [maintenanceAlertCount, setMaintenanceAlertCount] = useState(0);
  const [receiptQueryCount, setReceiptQueryCount] = useState(0);

  const unsubHrRef = useRef(null);
  const contentRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const globalSearchLoadRef = useRef("");
  const searchInputRef = useRef(null);
  const searchPaletteRef = useRef(null);
  const searchTriggerRef = useRef(null);
  const searchPreviousFocusRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  const mobileMenuCloseRef = useRef(null);

  const sidebarCollapsed = isMobileViewport ? !mobileNavOpen : isCollapsed;

  const currentWorkspace = useMemo(() => getWorkspaceForPath(pathname), [pathname]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      setIsCollapsed(saved.collapsed === true);
      if (saved.expandedGroups && typeof saved.expandedGroups === "object") {
        setExpandedGroups((current) => ({ ...current, ...saved.expandedGroups }));
      }
    } catch {
      // Device storage is optional; default navigation remains fully expanded.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_PREFERENCE_KEY,
        JSON.stringify({ collapsed: isCollapsed, expandedGroups })
      );
    } catch {
      // Keep the in-memory state when storage is unavailable.
    }
  }, [expandedGroups, isCollapsed]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const focusFrame = requestAnimationFrame(() => mobileMenuCloseRef.current?.focus?.());

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setMobileNavOpen(false);
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus?.());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  //  single source of truth for whether Admin tab should show
  const canSeeAdmin = !!isAdmin;
  const currentRole = normalizePlatformRole(userDoc?.role);
  const canSeePlatformAdmin = canSeeAdmin && currentRole === "platformAdmin";

  //  HR badge should show for admins only
  const canSeeHrBadge = !!isAdmin;

  useEffect(() => {
    if (!canUseAdminViewSwitch) {
      setViewAsUsers([]);
      setViewAsError("");
      setViewAsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadUsers = async () => {
      setViewAsLoading(true);
      setViewAsError("");
      try {
        const token = await realUser?.getIdToken?.();
        if (!token) throw new Error("Your admin session is not ready.");
        const res = await fetch("/api/admin/overview", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not load users.");
        if (cancelled) return;
        const rows = Array.isArray(data.users) ? data.users : [];
        setViewAsUsers(dedupeViewAsUsers(rows));
      } catch (error) {
        console.warn("[view-as] user list unavailable:", error);
        if (!cancelled) {
          setViewAsUsers([]);
          setViewAsError(error?.message || "Could not load users.");
        }
      } finally {
        if (!cancelled) setViewAsLoading(false);
      }
    };
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [canUseAdminViewSwitch, realUser, viewAsReloadKey]);

  useEffect(() => {
    if (!employeeAccess) return;

    const storedWorkspace =
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.localStorage : null) ||
      getStoredActiveWorkspace(typeof window !== "undefined" ? window.sessionStorage : null);

    setActiveWorkspace(
      storedWorkspace === "service" && employeeAccess.hasServiceAccess
        ? "service"
        : storedWorkspace === "user" && employeeAccess.hasUserAccess
          ? "user"
          : employeeAccess.defaultWorkspace
    );
  }, [employeeAccess]);

  useEffect(() => {
    if (unsubHrRef.current) {
      unsubHrRef.current();
      unsubHrRef.current = null;
    }

    if (!canSeeHrBadge) {
      setHrNotif({ requests: 0, deletes: 0 });
      return undefined;
    }

    const accessState = { user, userDoc, isEnabled, accessReady };
    const gate = resolveDataAccess(accessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "holidays",
        operation: "listen HR badge",
      });
      setHrNotif({ requests: 0, deletes: 0 });
      return undefined;
    }

    const hrRequestQuery = tenantCollectionQuery(db, "holidays", accessState, [], CALENDAR_ACCESS_OPTIONS);
    unsubHrRef.current = onSnapshot(
      hrRequestQuery,
      (qs) => {
        clearPagePermissionDenied();
        const holidays = qs.docs.map((document) => document.data() || {});
        setHrNotif(getHolidayApprovalQueueCounts(holidays, new Date().getFullYear()));
      },
      (error) => {
        handleFirestoreAccessError(error, {
          collectionName: "holidays",
          operation: "listen HR badge",
        });
        setHrNotif({ requests: 0, deletes: 0 });
      }
    );

    return () => {
      if (unsubHrRef.current) {
        unsubHrRef.current();
        unsubHrRef.current = null;
      }
    };
  }, [accessReady, canSeeHrBadge, isEnabled, user, userDoc]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !accessReady || !isEnabled) {
      setMaintenanceAlertCount(0);
      return undefined;
    }
    user.getIdToken().then((token) => fetch("/api/maintenance/alerts", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!cancelled) setMaintenanceAlertCount(Number(data?.count || 0));
    }).catch(() => {
      if (!cancelled) setMaintenanceAlertCount(0);
    });
    return () => { cancelled = true; };
  }, [accessReady, isEnabled, user]);

  useEffect(() => {
    if (!user || !accessReady || !isEnabled) {
      setReceiptQueryCount(0);
      return undefined;
    }
    const accessState = { user, userDoc, isEnabled, accessReady };
    const companyId = String(userDoc?.companyId || "bickers-action");
    try {
      return onSnapshot(
        tenantCollectionQuery(db, "receipts", accessState, [
          where("companyId", "==", companyId),
          where("submitterUid", "==", user.uid),
          where("status", "==", "queried"),
          limit(100),
        ]),
        (snapshot) => setReceiptQueryCount(snapshot.size),
        () => setReceiptQueryCount(0)
      );
    } catch {
      setReceiptQueryCount(0);
      return undefined;
    }
  }, [accessReady, isEnabled, user, userDoc]);

  useEffect(() => {
    setPermissionIssue(null);

    const samePage = (detail = {}) => {
      const detailPath = String(detail.pathname || "").trim();
      return !detailPath || detailPath === pathname;
    };

    const handlePermissionDenied = (event) => {
      const detail = event?.detail || {};
      if (!samePage(detail)) return;
      setPermissionIssue(detail);
    };

    const handlePermissionClear = (event) => {
      const detail = event?.detail || {};
      if (!samePage(detail)) return;
      setPermissionIssue(null);
    };

    window.addEventListener(PAGE_PERMISSION_DENIED_EVENT, handlePermissionDenied);
    window.addEventListener(PAGE_PERMISSION_CLEAR_EVENT, handlePermissionClear);
    return () => {
      window.removeEventListener(PAGE_PERMISSION_DENIED_EVENT, handlePermissionDenied);
      window.removeEventListener(PAGE_PERMISSION_CLEAR_EVENT, handlePermissionClear);
    };
  }, [pathname]);

  /* -------------------------------------------
     NAV DEFINITIONS
  -------------------------------------------- */
  const featureVisible = (path) => {
    // Settings contains personal, device-local preferences and is available to every signed-in user.
    if (path === "/settings") return true;
    if (isFinancePath(path) && !hasFinanceAccess(userDoc)) return false;
    if (canSeeAdmin) return true;
    return isModuleEnabledForPath(path, featureFlags);
  };

  const userSidebarGroups = [
    {
      heading: "Operations",
      items: [
        { label: contentLabel("navigation.home"), path: "/screens/homescreen", Icon: Home },
        { label: "Diary", path: "/dashboard", Icon: CalendarDays },
        { label: "U-Crane", path: "/u-crane", Icon: UCraneIcon },
        { label: "Enquiries", path: "/enquiry", Icon: MessageSquareText },
        { label: "Booking Drafts", path: "/booking-drafts", Icon: FileText },
        { label: "Jobs Sheets", path: "/job-home", Icon: ClipboardList },
        { label: "Review Queue", path: "/review-queue", Icon: ListChecks },
      ],
    },
    {
      heading: "People & Fleet",
      items: [
        { label: "HR / Timesheets", path: "/hr", Icon: Clock3 },
        { label: contentLabel("navigation.employees"), path: "/employees", Icon: Users },
        { label: `${contentLabel("navigation.vehicles")} & ${contentLabel("navigation.equipment")}`, path: "/vehicle-home", Icon: CarFront },
        { label: "Vehicle Register", path: "/vehicles", Icon: ListTree },
        { label: "Maintenance alerts", path: "/maintenance-alerts", Icon: Wrench },
      ],
    },
    {
      heading: "Business",
      items: [
        { label: "H&S", path: "/h-and-s", Icon: ShieldCheck },
        { label: "Receipts", path: "/receipts", Icon: Receipt },
        { label: "Invoicing", path: "/finance-dashboard", Icon: BadgePoundSterling },
        { label: "Saved Contacts", path: "/saved-contacts", Icon: ContactRound },
        { label: "Statistics", path: "/statistics", Icon: ChartNoAxesCombined },
      ],
    },
  ];

  const visibleSidebarGroups = userSidebarGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => featureVisible(item.path)),
    }))
    .filter((group) => group.items.length > 0);
  const normalizedNavSearch = navSearch.trim().toLowerCase();
  const searchablePageItems = Array.from(
    new Map(
      [...visibleSidebarGroups.flatMap((group) => group.items), ...GLOBAL_SEARCH_PAGE_ITEMS]
        .filter((item) => featureVisible(item.path))
        .filter((item) => item.path !== "/admin" || canSeeAdmin)
        .map((item) => [item.path, item])
    ).values()
  );
  const matchingPageItems = normalizedNavSearch
    ? searchablePageItems
        .filter((item) => {
          const haystack = globalSearchText(item.label, item.keywords, item.path).toLowerCase();
          return normalizedNavSearch.split(/\s+/).every((term) => haystack.includes(term));
        })
        .sort((a, b) => {
          const aLabel = a.label.toLowerCase();
          const bLabel = b.label.toLowerCase();
          const aRank = aLabel === normalizedNavSearch ? 0 : aLabel.startsWith(normalizedNavSearch) ? 1 : 2;
          const bRank = bLabel === normalizedNavSearch ? 0 : bLabel.startsWith(normalizedNavSearch) ? 1 : 2;
          return aRank - bRank || a.label.localeCompare(b.label);
        })
    : [];
  const workspaceNavGroups = visibleSidebarGroups;
  const workspaceNav = [
    ...visibleSidebarGroups.flatMap((group) => group.items),
    { label: "Settings", path: "/settings", Icon: Settings },
  ];
  const shouldLoadGlobalSearch = globalSearchLoadReady;

  useEffect(() => {
    if (globalSearchLoaded || globalSearchLoading) return undefined;
    if (!searchOpen || normalizedNavSearch.length < 2) {
      setGlobalSearchLoadReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGlobalSearchLoadReady(true), 250);
    return () => window.clearTimeout(timer);
  }, [globalSearchLoaded, globalSearchLoading, normalizedNavSearch, searchOpen]);

  useEffect(() => {
    if (!shouldLoadGlobalSearch || !user || !accessReady || !isEnabled) return undefined;

    const loadKey = globalSearchText(
      user.uid,
      userDoc?.companyId,
      adminViewMode,
      adminViewUserId
    );
    if (globalSearchLoadRef.current === loadKey && globalSearchLoaded) return undefined;

    let cancelled = false;
    globalSearchLoadRef.current = loadKey;
    setGlobalSearchLoading(true);
    setGlobalSearchLoaded(false);
    setGlobalSearchUnavailableTypes([]);

    const accessState = { user, userDoc, isEnabled, accessReady };
    const sources = [
      featureVisible("/dashboard") && {
        collectionName: "bookings",
        max: 1600,
        type: "Job",
        Icon: BriefcaseBusiness,
        build: (id, row) => ({
          label: row.jobNumber ? `Job #${row.jobNumber}` : row.client || row.production || `Job ${id}`,
          meta: globalSearchText(row.client, row.productionCompany, row.location, row.status),
          path: `/job-numbers/${encodeURIComponent(id)}`,
          search: globalSearchText(id, row.jobNumber, row.client, row.production, row.productionCompany, row.location, row.status, row.notes, row.generalNotes),
        }),
      },
      featureVisible("/employee-home") && {
        collectionName: "employees",
        max: 600,
        type: "Employee",
        Icon: Users,
        build: (id, row) => {
          const name = row.name || row.displayName || row.fullName || row.email || id;
          return {
            label: name,
            meta: globalSearchText(row.jobTitle, row.role, row.department, row.email),
            path: `/employee-home/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`,
            search: globalSearchText(id, name, row.email, row.phone, row.jobTitle, row.role, row.department),
          };
        },
      },
      featureVisible("/vehicle-home") && {
        collectionName: "vehicles",
        max: 700,
        type: "Vehicle",
        Icon: CarFront,
        build: (id, row) => ({
          label: row.name || row.registration || row.reg || `Vehicle ${id}`,
          meta: globalSearchText(row.registration || row.reg, row.make, row.model, row.category),
          path: `/vehicle-edit/${encodeURIComponent(id)}`,
          search: globalSearchText(id, row.name, row.registration, row.reg, row.make, row.model, row.category, row.type, row.status),
        }),
      },
      featureVisible("/equipment") && {
        collectionName: "equipment",
        max: 700,
        type: "Equipment",
        Icon: ListTree,
        build: (id, row) => ({
          label: row.name || row.label || row.assetNumber || `Equipment ${id}`,
          meta: globalSearchText(row.serialNumber, row.assetNumber, row.category, row.status),
          path: `/edit-equipment/${encodeURIComponent(id)}`,
          search: globalSearchText(id, row.name, row.label, row.serialNumber, row.assetNumber, row.category, row.type, row.status),
        }),
      },
      featureVisible("/saved-contacts") && {
        collectionName: "contacts",
        max: 1200,
        type: "Contact",
        Icon: ContactRound,
        build: (id, row) => ({
          label: row.name || row.email || row.company || `Contact ${id}`,
          meta: globalSearchText(row.company, row.department, row.email, row.phone),
          path: `/saved-contacts?search=${encodeURIComponent(row.email || row.name || row.company || id)}`,
          search: globalSearchText(id, row.name, row.email, row.phone, row.company, row.department),
        }),
      },
      featureVisible("/maintenance-jobs") && {
        collectionName: "maintenanceJobs",
        max: 700,
        type: "Maintenance",
        Icon: Wrench,
        build: (id, row) => ({
          label: row.jobNumber || row.title || row.vehicleName || `Maintenance ${id}`,
          meta: globalSearchText(row.vehicleName, row.registration, row.status, row.maintenanceType),
          path: `/maintenance-jobs?jobId=${encodeURIComponent(id)}`,
          search: globalSearchText(id, row.jobNumber, row.title, row.vehicleName, row.registration, row.status, row.maintenanceType, row.notes),
        }),
      },
      featureVisible("/finance-dashboard") && {
        collectionName: "invoices",
        max: 1200,
        type: "Invoice",
        Icon: Receipt,
        build: (id, row) => ({
          label: row.invoiceNumber ? `Invoice ${row.invoiceNumber}` : row.jobNumber ? `Invoice for #${row.jobNumber}` : `Invoice ${id}`,
          meta: globalSearchText(row.client, row.customerName, row.jobNumber, row.status),
          path: `/invoice/${encodeURIComponent(id)}`,
          search: globalSearchText(id, row.invoiceNumber, row.jobNumber, row.client, row.customerName, row.purchaseOrderNumber, row.status),
        }),
      },
    ].filter(Boolean);

    Promise.allSettled(
      sources.map(async (source) => {
        const snapshot = await getDocs(
          tenantCollectionQuery(db, source.collectionName, accessState, [limit(source.max)])
        );
        return snapshot.docs.map((document) => {
          const built = source.build(document.id, document.data() || {});
          return {
            id: `${source.collectionName}:${document.id}`,
            type: source.type,
            Icon: source.Icon,
            ...built,
            searchText: globalSearchText(source.type, built.label, built.meta, built.search).toLowerCase(),
          };
        });
      })
    ).then((results) => {
      if (cancelled) return;
      const unavailableTypes = results.flatMap((result, index) =>
        result.status === "rejected" ? [sources[index]?.type || "Unknown"] : []
      );
      setGlobalSearchRecords(
        results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
      );
      setGlobalSearchUnavailableTypes(unavailableTypes);
      setGlobalSearchLoaded(true);
      setGlobalSearchLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessReady, adminViewMode, adminViewUserId, globalSearchLoaded, isEnabled, shouldLoadGlobalSearch, user, userDoc]);

  const matchingGlobalRecords = useMemo(() => {
    if (normalizedNavSearch.length < 2) return [];
    const terms = normalizedNavSearch.split(/\s+/).filter(Boolean);
    const relevance = (record) => {
      const label = record.label.toLowerCase();
      if (label === normalizedNavSearch) return 0;
      if (label.startsWith(normalizedNavSearch)) return 1;
      if (terms.every((term) => label.includes(term))) return 2;
      if (label.includes(normalizedNavSearch)) return 3;
      return 4;
    };
    return globalSearchRecords
      .filter((record) => terms.every((term) => record.searchText.includes(term)))
      .sort((a, b) => {
        return relevance(a) - relevance(b) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
      })
      .slice(0, 30);
  }, [globalSearchRecords, normalizedNavSearch]);

  const palettePageItems = normalizedNavSearch ? matchingPageItems.slice(0, 10) : [];
  const paletteRecordItems = normalizedNavSearch.length >= 2 ? matchingGlobalRecords : [];
  const paletteResults = [
    ...palettePageItems.map((item) => ({ ...item, type: "Page", id: `page:${item.path}` })),
    ...paletteRecordItems,
  ];
  const recentSearchPaths = new Set(recentSearches.map((item) => item.path));
  const paletteQuickLinks = searchablePageItems
    .filter((item) => !recentSearchPaths.has(item.path))
    .slice(0, 6)
    .map((item) => ({ ...item, type: "Page", id: `page:${item.path}` }));
  const idlePaletteResults = [...recentSearches, ...paletteQuickLinks];
  const activePaletteResults = normalizedNavSearch ? paletteResults : idlePaletteResults;

  const closeGlobalSearch = () => {
    setSearchOpen(false);
    setNavSearch("");
    setSearchActiveIndex(0);
    const focusTarget = searchPreviousFocusRef.current || searchTriggerRef.current;
    requestAnimationFrame(() => focusTarget?.focus?.());
  };

  const openGlobalSearch = () => {
    searchPreviousFocusRef.current = document.activeElement;
    setSearchOpen(true);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    setSearchActiveIndex(0);
    try {
      window.localStorage.removeItem("bickers-global-search:recent");
    } catch {
      // Recent searches are an optional device convenience.
    }
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("bickers-global-search:recent") || "[]");
      if (Array.isArray(saved)) {
        setRecentSearches(
          saved.slice(0, 5).map(({ id, label, path, type }) => ({ id, label, path, type }))
        );
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (searchOpen) {
          closeGlobalSearch();
        } else {
          openGlobalSearch();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setSearchActiveIndex(0);
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    const trapFocus = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGlobalSearch();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        searchPaletteRef.current?.querySelectorAll('input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []
      ).filter((element) => !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
    };
  }, [searchOpen]);

  useEffect(() => {
    setSearchActiveIndex(0);
  }, [normalizedNavSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    const activeResult = activePaletteResults[searchActiveIndex];
    if (!activeResult?.id) return;
    document.getElementById(globalSearchDomId(activeResult.id))?.scrollIntoView({ block: "nearest" });
  }, [activePaletteResults, searchActiveIndex, searchOpen]);

  /* -------------------------------------------
     LOGOUT
  -------------------------------------------- */
  const handleLogout = async () => {
    if (typeof logout === "function") await logout();
    router.push("/login");
  };

  const handleWorkspaceChange = (event) => {
    const nextWorkspace = event.target.value;
    if (!employeeAccess || !["user", "service"].includes(nextWorkspace)) return;
    setActiveWorkspace(nextWorkspace);
    setStoredActiveWorkspace(window.localStorage, nextWorkspace);
    setStoredActiveWorkspace(window.sessionStorage, nextWorkspace);
    attemptNavigation(() => router.push(selectLandingRoute(employeeAccess, nextWorkspace)));
  };

  const toggleSidebarGroup = (heading) => {
    setExpandedGroups((current) => ({ ...current, [heading]: current[heading] === false }));
  };

  useEffect(() => {
    const handleChange = () => {
      if (pendingNavigationRef.current) {
        setPendingNavigation((current) => (current ? { ...current } : current));
      }
    };
    window.addEventListener(UNSAVED_CHANGES_EVENT, handleChange);
    return () => window.removeEventListener(UNSAVED_CHANGES_EVENT, handleChange);
  }, []);

  const runNavigation = async (action) => {
    bypassUnsavedChangesOnce();
    await action();
  };

  const attemptNavigation = (action) => {
    const guard = getUnsavedChangesState();
    if (!guard?.isDirty || shouldBypassUnsavedChanges()) {
      runNavigation(action);
      return;
    }

    pendingNavigationRef.current = action;
    setPendingNavigation({
      message: guard.message || "You have unsaved changes on this page.",
      saveLabel: guard.saveLabel || "Save & Leave",
      canSave: typeof guard.onSave === "function",
    });
  };

  const attemptNavigationRef = useRef(attemptNavigation);
  attemptNavigationRef.current = attemptNavigation;

  useEffect(() => {
    const handleNavigationRequest = (event) => {
      const action = event?.detail?.action;
      if (typeof action !== "function") return;
      event.preventDefault();
      attemptNavigationRef.current(action);
    };
    window.addEventListener(UNSAVED_NAVIGATION_REQUEST_EVENT, handleNavigationRequest);
    return () => window.removeEventListener(UNSAVED_NAVIGATION_REQUEST_EVENT, handleNavigationRequest);
  }, []);

  const openSearchResult = (result) => {
    if (!result?.path) return;
    const recent = {
      id: result.id || `page:${result.path}`,
      label: result.label,
      path: result.path,
      type: result.type || "Page",
    };
    const nextRecent = [recent, ...recentSearches.filter((item) => item.path !== recent.path)].slice(0, 5);
    setRecentSearches(nextRecent);
    try {
      window.localStorage.setItem("bickers-global-search:recent", JSON.stringify(nextRecent));
    } catch {
      // Recent searches are an optional device convenience.
    }
    closeGlobalSearch();
    attemptNavigation(() => router.push(result.path));
  };

  const handleSearchKeyDown = (event) => {
    const selectableResults = activePaletteResults;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchActiveIndex((index) => selectableResults.length ? (index + 1) % selectableResults.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchActiveIndex((index) => selectableResults.length ? (index - 1 + selectableResults.length) % selectableResults.length : 0);
    } else if (event.key === "Enter" && selectableResults[searchActiveIndex]) {
      event.preventDefault();
      openSearchResult(selectableResults[searchActiveIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeGlobalSearch();
    }
  };

  /* -------------------------------------------
     BACK BUTTON
  -------------------------------------------- */
  //  badge total (requested + delete)
  const hrBadgeTotal = useMemo(() => {
    return (hrNotif?.requests || 0) + (hrNotif?.deletes || 0);
  }, [hrNotif]);

  const accountSetup = useMemo(() => {
    const emailReady = user?.emailVerified === true;

    return {
      complete: emailReady,
      label: emailReady ? "Verified" : "Setup incomplete",
      detail: emailReady ? "Email is verified" : "Email verification is required",
    };
  }, [user?.emailVerified]);

  const accountBadge = useMemo(() => {
    return {
      initials: initialsFromAccount(user, userDoc || {}),
      name: displayNameFromAccount(user, userDoc || {}),
      email: String(userDoc?.email || user?.email || "").trim(),
      accessLabel: accessLabelForAccount(userDoc || {}, isAdmin),
    };
  }, [isAdmin, user, userDoc]);

  const pageAccess = useMemo(
    () =>
      resolvePageAccessStatus({
        canSeePlatformAdmin,
        isAdmin,
        pathname,
        user,
        userDoc,
      }),
    [
      canSeePlatformAdmin,
      isAdmin,
      pathname,
      user,
      userDoc,
    ]
  );

  const dataAccess = useMemo(() => {
    if (!permissionIssue) {
      return {
        status: "authorised",
        label: "OK",
        detail: "No Firestore permission failures detected on this page.",
      };
    }

    const target = [permissionIssue.operation, permissionIssue.collectionName]
      .filter(Boolean)
      .join(" ");
    const collectionLabel = permissionIssue.collectionName || "Firestore";

    return {
      status: "denied",
      label: collectionLabel.length > 18 ? "Denied" : `Denied: ${collectionLabel}`,
      detail: target ? `Firestore denied ${target}.` : "Firestore denied data access for this page.",
    };
  }, [permissionIssue]);

  const pageAccessTone = {
    authorised: {
      background: "var(--color-success-soft)",
      border: "1px solid var(--color-success-border)",
      dot: "var(--color-success-accent)",
      text: "var(--color-success)",
      sub: "var(--color-success)",
    },
    denied: {
      background: "var(--color-danger-soft)",
      border: "1px solid var(--color-danger-border)",
      dot: "var(--color-danger)",
      text: "var(--color-danger)",
      sub: "var(--color-danger)",
    },
    checking: {
      background: "var(--color-warning-soft)",
      border: "1px solid var(--color-warning-border)",
      dot: "var(--color-warning)",
      text: "var(--color-warning)",
      sub: "var(--color-warning)",
    },
  }[pageAccess.status];

  const dataAccessTone = {
    authorised: {
      background: "var(--color-success-soft)",
      border: "1px solid var(--color-success-border)",
      dot: "var(--color-success-accent)",
      text: "var(--color-success)",
    },
    denied: {
      background: "var(--color-danger-soft)",
      border: "1px solid var(--color-danger-border)",
      dot: "var(--color-danger)",
      text: "var(--color-danger)",
    },
  }[dataAccess.status];

  const currentNavItem = useMemo(() => {
    return (
      workspaceNav.find(({ path }) =>
        pathname === path ||
        (path === "/screens/homescreen" && pathname === "/home") ||
        (path === "/service/home" && pathname === "/service-home") ||
        (path === "/h-and-s" && (pathname === "/h-and-s" || String(pathname || "").startsWith("/defects")))
      ) || null
    );
  }, [pathname, workspaceNav]);

  const landingRoute = useMemo(() => {
    if (!employeeAccess) return "/dashboard";
    return selectLandingRoute(employeeAccess, activeWorkspace);
  }, [employeeAccess, activeWorkspace]);

  const scrollRestoreKey = useMemo(() => {
    return `layout-scroll:${pathname || "/"}`;
  }, [pathname]);

  const shouldShowBackButton = useMemo(() => {
    return shouldShowShellBackButton({
      override: typeof nestedBackButtonOverride === "boolean"
        ? nestedBackButtonOverride
        : showBackButton,
      pathname,
      landingRoute,
      hasPrimaryNavigationMatch: Boolean(currentNavItem),
    });
  }, [nestedBackButtonOverride, showBackButton, pathname, landingRoute, currentNavItem]);

  const handleBack = () => {
    if (backHref) {
      attemptNavigation(() => router.push(backHref));
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      attemptNavigation(() => router.back());
      return;
    }

    attemptNavigation(() => router.push(landingRoute));
  };

  const handleStayOnPage = () => {
    pendingNavigationRef.current = null;
    setPendingNavigation(null);
  };

  const handleLeaveWithoutSaving = async () => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setPendingNavigation(null);
    if (action) await runNavigation(action);
  };

  const handleSaveAndLeave = async () => {
    const guard = getUnsavedChangesState();
    const action = pendingNavigationRef.current;
    if (!action) {
      setPendingNavigation(null);
      return;
    }

    if (typeof guard?.onSave === "function") {
      const result = await guard.onSave();
      if (result === false) return;
    }

    pendingNavigationRef.current = null;
    setPendingNavigation(null);
    await runNavigation(action);
  };

  useEffect(() => {
    if (!employeeAccess) return;
    if (currentWorkspace === "service" && employeeAccess.hasServiceAccess) {
      setActiveWorkspace("service");
      return;
    }
    if (currentWorkspace === "user" && employeeAccess.hasUserAccess) {
      setActiveWorkspace("user");
    }
  }, [currentWorkspace, employeeAccess]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const restore = () => {
      try {
        const saved = Number(sessionStorage.getItem(scrollRestoreKey) || 0);
        if (Number.isFinite(saved) && saved > 0) {
          el.scrollTop = saved;
        } else {
          el.scrollTop = 0;
        }
      } catch {
        el.scrollTop = 0;
      }
    };

    const raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, [scrollRestoreKey]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const save = () => {
      try {
        sessionStorage.setItem(scrollRestoreKey, String(el.scrollTop || 0));
      } catch {
        // ignore sessionStorage errors
      }
    };

    el.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      el.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [scrollRestoreKey]);

  return (
    <PersistentShellContext.Provider value={persistentShell}>
      <div className={`${layoutStyles.shellRoot} app-shell-root`}>
      {mobileNavOpen ? (
        <button
          type="button"
          className={layoutStyles.mobileNavBackdrop}
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      {/* ----------------- Sidebar ----------------- */}
      {/* style-audit-allow runtime: responsive sidebar geometry */}
      <aside
        className={layoutStyles.sidebar}
        id="primary-navigation"
        data-collapsed={sidebarCollapsed}
        data-mobile-open={mobileNavOpen}
        aria-hidden={isMobileViewport && !mobileNavOpen ? true : undefined}
        inert={isMobileViewport && !mobileNavOpen ? true : undefined}
        style={{ "--sidebar-width": sidebarCollapsed ? "var(--shell-sidebar-collapsed-width)" : "clamp(248px, var(--shell-sidebar-width), 300px)" }}
      >
        <div className={layoutStyles.sidebarBrandRow}>
          <div className={layoutStyles.sidebarBrand}>
            <img
              src={appearance.theme.companyLogo || "/bickers-action-logo.png"}
              alt={`${appearance.theme.appName} logo`}
              className={layoutStyles.sidebarLogo}
            />
            {!sidebarCollapsed ? (
              <span className={layoutStyles.sidebarBrandCopy}>
                <strong>Bickers System</strong>
                <small>Operations platform</small>
              </span>
            ) : null}
          </div>
          <Button
            bare
            ref={mobileMenuCloseRef}
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            className={layoutStyles.sidebarCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </Button>
          <Button
            bare
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className={layoutStyles.mobileMenuClose}
            aria-label="Close navigation"
            title="Close navigation"
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>

        {!sidebarCollapsed ? (
          <div className={layoutStyles.sidebarControls}>
            <label className={layoutStyles.workspaceSelectWrap}>
              <UserRound size={16} aria-hidden="true" />
              <span className={layoutStyles.srOnly}>Workspace</span>
              <select
                value={activeWorkspace}
                onChange={handleWorkspaceChange}
                className={layoutStyles.workspaceSelect}
                aria-label="Choose workspace"
              >
                {employeeAccess?.hasUserAccess ? <option value="user">User workspace</option> : null}
                {employeeAccess?.hasServiceAccess ? <option value="service">Service workspace</option> : null}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>

            <Button
              bare
              type="button"
              ref={searchTriggerRef}
              className={layoutStyles.sidebarSearchTrigger}
              onClick={openGlobalSearch}
              aria-label="Search the software"
              aria-haspopup="dialog"
            >
              <Search size={15} aria-hidden="true" />
              <span>Search anything…</span>
            </Button>
          </div>
        ) : null}

        <div className={layoutStyles.sidebarScroll}>
          <nav className={layoutStyles.sidebarNav} aria-label="Primary navigation">
            {workspaceNavGroups.map((group) => {
              const groupOpen = expandedGroups[group.heading] !== false;
              return (
                <section className={layoutStyles.sidebarGroup} key={group.heading}>
                  {!sidebarCollapsed ? (
                    <Button
                      bare
                      type="button"
                      className={layoutStyles.sidebarGroupButton}
                      onClick={() => toggleSidebarGroup(group.heading)}
                      aria-expanded={groupOpen}
                      aria-controls={`sidebar-group-${group.heading.replaceAll(" ", "-").toLowerCase()}`}
                    >
                      <span>{group.heading}</span>
                      <ChevronDown size={14} data-open={groupOpen} aria-hidden="true" />
                    </Button>
                  ) : (
                    <div className={layoutStyles.sidebarGroupDivider} aria-hidden="true" />
                  )}

                  {groupOpen ? (
                    <div
                      id={`sidebar-group-${group.heading.replaceAll(" ", "-").toLowerCase()}`}
                      className={layoutStyles.sidebarItems}
                    >
                      {group.items.map(({ label, path, Icon }) => {
                  const active =
                    pathname === path ||
                    (path === "/screens/homescreen" && pathname === "/home") ||
                    (path === "/dashboard" && String(pathname || "").startsWith("/recce-form/")) ||
                    (path === "/service/home" && pathname === "/service-home") ||
                    (path === "/h-and-s" && (pathname === "/h-and-s" || String(pathname || "").startsWith("/defects")));

                  const isHrItem = path === "/hr";
                  const showHrBadge = isHrItem && canSeeHrBadge && hrBadgeTotal > 0;
                  const showMaintenanceBadge = path === "/maintenance-alerts" && maintenanceAlertCount > 0;
                  const showReceiptBadge = path === "/receipts" && receiptQueryCount > 0;
                  return (
                    <Button bare
                      key={label}
                      onClick={() => attemptNavigation(() => router.push(path))}
                      className={`${layoutStyles.navButton} ${active ? layoutStyles.navButtonActive : ""} ${sidebarCollapsed ? layoutStyles.navButtonCollapsed : ""}`}
                      aria-current={active ? "page" : undefined}
                      title={
                        showHrBadge
                          ? `${label}: ${hrNotif.requests} holiday request(s), ${hrNotif.deletes} delete request(s)`
                          : showMaintenanceBadge
                            ? `${label}: ${maintenanceAlertCount} open alert(s)`
                          : showReceiptBadge
                            ? `${label}: ${receiptQueryCount} receipt query or queries`
                          : label
                      }
                    >
                      <Icon size={17} strokeWidth={1.9} className={layoutStyles.navIcon} aria-hidden="true" />
                      {!sidebarCollapsed ? (
                        <span className={layoutStyles.navLabelRow}>
                          <span className={layoutStyles.navLabel}>{label}</span>
                          {showHrBadge && (
                            <span className={layoutStyles.navBadge}>{hrBadgeTotal}</span>
                          )}
                          {showMaintenanceBadge && (
                            <span className={layoutStyles.navBadge}>{maintenanceAlertCount}</span>
                          )}
                          {showReceiptBadge && (
                            <span className={layoutStyles.navBadge}>{receiptQueryCount}</span>
                          )}
                        </span>
                      ) : null}

                      {sidebarCollapsed && (showHrBadge || showMaintenanceBadge || showReceiptBadge) ? (
                        <span className={layoutStyles.navBadgeDot} />
                      ) : null}
                    </Button>
                  );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}

          </nav>
        </div>

        <div className={layoutStyles.sidebarFooter}>
          <Button
            bare
            type="button"
            onClick={() => attemptNavigation(() => router.push("/settings"))}
            className={`${layoutStyles.navButton} ${pathname === "/settings" ? layoutStyles.navButtonActive : ""} ${sidebarCollapsed ? layoutStyles.navButtonCollapsed : ""}`}
            title="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings size={17} className={layoutStyles.navIcon} aria-hidden="true" />
            {!sidebarCollapsed ? <span className={layoutStyles.navLabel}>Settings</span> : null}
          </Button>

          <div className={layoutStyles.sidebarAccountRow}>
            <Button
              bare
              type="button"
              onClick={() => attemptNavigation(() => router.push("/settings"))}
              className={layoutStyles.sidebarAccount}
              title={`${accountBadge.name} · ${accountBadge.accessLabel}`}
            >
              <span className={layoutStyles.sidebarAvatar}>{accountBadge.initials}</span>
              {!sidebarCollapsed ? (
                <span className={layoutStyles.sidebarAccountCopy}>
                  <strong>{accountBadge.name}</strong>
                  <small>{accountBadge.accessLabel}</small>
                </span>
              ) : null}
            </Button>
            <Button
              bare
              type="button"
              onClick={() => attemptNavigation(handleLogout)}
              className={layoutStyles.sidebarLogout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={17} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ----------------- Main ----------------- */}
      <div
        className={layoutStyles.extracted15}
      >
        {/* Header */}
        <header
          className={layoutStyles.extracted16}
        >
          <div className={layoutStyles.extracted17}>
            {shouldShowBackButton && (
              <Button bare
                type="button"
                onClick={handleBack}
                className={layoutStyles.backButton}
                aria-label={backLabel}
                title={backLabel}
              >
                <span aria-hidden="true">&larr;</span>
                <span>{backLabel}</span>
              </Button>
            )}
            <div className={layoutStyles.extracted18}>
              <div
                className={layoutStyles.extracted19}
              >
                User workspace
              </div>
              <div
                className={layoutStyles.extracted20}
              >
                {currentNavItem?.label || appearance.theme.appName}
              </div>
            </div>
          </div>

          <div className={layoutStyles.mobileHeaderActions}>
            <Button
              bare
              type="button"
              className={layoutStyles.mobileHeaderButton}
              onClick={openGlobalSearch}
              aria-label="Search the software"
              title="Search"
            >
              <Search size={20} aria-hidden="true" />
            </Button>
            <Button
              bare
              ref={mobileMenuButtonRef}
              type="button"
              className={layoutStyles.mobileHeaderButton}
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="primary-navigation"
              title="Menu"
            >
              <Menu size={21} aria-hidden="true" />
            </Button>
          </div>

          <nav
            className={layoutStyles.extracted21}
          >
            <div
              className={layoutStyles.extracted25}
              data-complete={accountSetup.complete}
              title={[accountBadge.name, accountBadge.email, accountBadge.accessLabel, accountSetup.detail]
                .filter(Boolean)
                .join(" - ")}
              aria-label={`Signed in as ${accountBadge.name}, ${accountBadge.accessLabel}. ${accountSetup.detail}`}
            >
              <span
                className={layoutStyles.extracted26}
              >
                {accountBadge.initials}
                <span className={layoutStyles.accountStatusDot} aria-hidden="true" />
              </span>
              <span className={layoutStyles.extracted27}>
                <span
                  className={layoutStyles.extracted28}
                >
                  {accountBadge.accessLabel}
                </span>
                <span
                  className={layoutStyles.extracted29}
                >
                  {accountBadge.name}
                </span>
              </span>
            </div>

            {canUseAdminViewSwitch && (
              <Button bare
                type="button"
                onClick={() => setAdminViewMode?.(adminViewMode === "user" ? "admin" : "user")}
                className={layoutStyles.viewSwitch}
                data-mode={adminViewMode}
                title={adminViewMode === "user" ? "Return to your admin view." : "Test the app with normal user permissions."}
                aria-label={`Testing view: ${adminViewMode === "user" ? "User" : "Admin"}`}
                aria-pressed={adminViewMode === "user"}
              >
                <span className={layoutStyles.viewLabel}>View</span>
                <span className={layoutStyles.viewLabelActive}>
                  {adminViewMode === "user" ? "User" : "Admin"}
                </span>
              </Button>
            )}

            {canUseAdminViewSwitch && (
              <Select bare
                value={adminViewUserId || ""}
                disabled={viewAsLoading}
                onChange={(event) => {
                  const selectedId = event.target.value;
                  if (!selectedId) {
                    setAdminViewUser?.(null);
                    return;
                  }
                  const selected = viewAsUsers.find(
                    (row) => String(row?.uid || row?.id || "") === selectedId
                  );
                  if (selected) setAdminViewUser?.(selected);
                }}
                onClick={() => {
                  if (viewAsError) setViewAsReloadKey((key) => key + 1);
                }}
                className={layoutStyles.extracted31}
                title={viewAsError ? `${viewAsError} Click to retry.` : "View the app as another enabled user."}
                aria-label="User account to test as"
              >
                <option value="" className={layoutStyles.extracted32}>
                  {viewAsLoading
                    ? "Loading users..."
                    : viewAsError
                      ? "Could not load users - retry"
                      : "Current user"}
                </option>
                {viewAsUsers.map((row) => {
                  const id = String(row?.uid || row?.id || "");
                  const label = row?.name || row?.email || id;
                  return (
                    <option key={id} value={id} className={layoutStyles.extracted33}>
                      {label}
                    </option>
                  );
                })}
              </Select>
            )}

            <div className={layoutStyles.themeSelector} role="group" aria-label="Colour mode">
              {[
                ["dark", "Dark", Moon],
                ["normal", "Normal", Monitor],
                ["light", "Light", Sun],
              ].map(([value, label, Icon]) => (
                <Button
                  bare
                  key={value}
                  type="button"
                  className={layoutStyles.themeModeButton}
                  data-selected={appearance.resolvedMode === value}
                  onClick={() => appearance.setModePreference(value)}
                  title={`Use ${label.toLowerCase()} mode`}
                  aria-pressed={appearance.resolvedMode === value}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
          </nav>
        </header>

        {searchOpen ? (
          <div
            className={layoutStyles.searchOverlay}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeGlobalSearch();
            }}
          >
            <section
              ref={searchPaletteRef}
              className={layoutStyles.searchPalette}
              role="dialog"
              aria-modal="true"
              aria-label="Search the software"
            >
              <div className={layoutStyles.searchPaletteHeader}>
                <span className={layoutStyles.searchHeaderIcon}>
                  <Search size={20} aria-hidden="true" />
                </span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={navSearch}
                  onChange={(event) => setNavSearch(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search jobs, people, vehicles, pages…"
                  aria-label="Search jobs, people, vehicles and pages"
                  role="combobox"
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-controls="global-search-results"
                  aria-activedescendant={activePaletteResults[searchActiveIndex]?.id ? globalSearchDomId(activePaletteResults[searchActiveIndex].id) : undefined}
                />
                {navSearch ? (
                  <Button bare type="button" className={layoutStyles.searchInputClear} onClick={() => setNavSearch("")} aria-label="Clear search">
                    <X size={18} />
                  </Button>
                ) : null}
                <Button bare type="button" className={layoutStyles.searchCloseButton} onClick={closeGlobalSearch} aria-label="Close search">
                  <X size={19} aria-hidden="true" />
                </Button>
              </div>

              <div className={layoutStyles.searchPaletteBody} id="global-search-results" role="listbox" aria-label="Search results">
                {!normalizedNavSearch ? (
                  <>
                    {recentSearches.length ? (
                      <div className={layoutStyles.searchSection}>
                        <div className={layoutStyles.searchSectionHeader}>
                          <div className={layoutStyles.searchSectionTitle}>Recent</div>
                          <Button bare type="button" className={layoutStyles.searchClearRecent} onClick={clearRecentSearches}>Clear</Button>
                        </div>
                        {recentSearches.map((result, index) => (
                          <Button
                            bare
                            type="button"
                            id={globalSearchDomId(result.id)}
                            key={`${result.id}:${index}`}
                            className={layoutStyles.searchResult}
                            data-active={index === searchActiveIndex}
                            role="option"
                            aria-selected={index === searchActiveIndex}
                            onMouseEnter={() => setSearchActiveIndex(index)}
                            onClick={() => openSearchResult(result)}
                          >
                            <span className={layoutStyles.searchResultIcon}><Clock3 size={18} aria-hidden="true" /></span>
                            <span className={layoutStyles.searchResultCopy}>
                              <strong>{result.label}</strong>
                              <small>Opened recently</small>
                            </span>
                            <span className={layoutStyles.searchResultType}>{result.type}</span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    <div className={layoutStyles.searchSection}>
                      <div className={layoutStyles.searchSectionTitle}>Quick links</div>
                      {paletteQuickLinks.map(({ id, label, path, Icon }, quickLinkIndex) => {
                        const index = recentSearches.length + quickLinkIndex;
                        return (
                        <Button bare type="button" id={globalSearchDomId(id)} key={path} className={layoutStyles.searchResult} data-active={index === searchActiveIndex} role="option" aria-selected={index === searchActiveIndex} onMouseEnter={() => setSearchActiveIndex(index)} onClick={() => openSearchResult({ label, path, type: "Page", id })}>
                          <span className={layoutStyles.searchResultIcon}><Icon size={18} aria-hidden="true" /></span>
                          <span className={layoutStyles.searchResultCopy}><strong>{label}</strong><small>Open page</small></span>
                          <span className={layoutStyles.searchResultType}>Page</span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </Button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={layoutStyles.searchQuerySummary} role="status" aria-live="polite">
                      <span>
                        {normalizedNavSearch.length >= 2 && !globalSearchLoaded
                          ? "Searching your workspace…"
                          : `${paletteResults.length} ${paletteResults.length === 1 ? "result" : "results"}`}
                      </span>
                      <small>
                        {normalizedNavSearch.length < 2
                          ? "Type one more character to include workspace records"
                          : "Pages, jobs, people, vehicles and more"}
                      </small>
                    </div>
                    {palettePageItems.length ? (
                      <div className={layoutStyles.searchSection}>
                        <div className={layoutStyles.searchSectionTitle}>Pages</div>
                        {palettePageItems.map(({ label, path, Icon }, index) => (
                          <Button
                            bare
                            type="button"
                            id={globalSearchDomId(`page:${path}`)}
                            key={path}
                            className={layoutStyles.searchResult}
                            data-active={index === searchActiveIndex}
                            role="option"
                            aria-selected={index === searchActiveIndex}
                            onMouseEnter={() => setSearchActiveIndex(index)}
                            onClick={() => openSearchResult({ label, path, type: "Page", id: `page:${path}` })}
                          >
                            <span className={layoutStyles.searchResultIcon}><Icon size={18} aria-hidden="true" /></span>
                            <span className={layoutStyles.searchResultCopy}><strong><SearchHighlight query={navSearch}>{label}</SearchHighlight></strong><small>Open page</small></span>
                            <span className={layoutStyles.searchResultType}>Page</span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </Button>
                        ))}
                      </div>
                    ) : null}

                    {paletteRecordItems.length ? (
                      <div className={layoutStyles.searchSection}>
                        <div className={layoutStyles.searchSectionTitle}>Workspace records</div>
                        {paletteRecordItems.map(({ id, label, meta, path, type, Icon }, recordIndex) => {
                          const index = palettePageItems.length + recordIndex;
                          return (
                            <Button
                              bare
                              type="button"
                              id={globalSearchDomId(id)}
                              key={id}
                              className={layoutStyles.searchResult}
                              data-active={index === searchActiveIndex}
                              role="option"
                              aria-selected={index === searchActiveIndex}
                              onMouseEnter={() => setSearchActiveIndex(index)}
                              onClick={() => openSearchResult({ id, label, meta, path, type })}
                            >
                              <span className={layoutStyles.searchResultIcon}><Icon size={18} aria-hidden="true" /></span>
                              <span className={layoutStyles.searchResultCopy}>
                                <strong><SearchHighlight query={navSearch}>{label}</SearchHighlight></strong>
                                <small>{meta ? <SearchHighlight query={navSearch}>{meta}</SearchHighlight> : "Open record"}</small>
                              </span>
                              <span className={layoutStyles.searchResultType}>{type}</span>
                              <ChevronRight size={17} aria-hidden="true" />
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}

                    {normalizedNavSearch.length >= 2 && !globalSearchLoaded ? (
                      <div className={layoutStyles.searchLoading} aria-hidden="true">
                        <span /><span /><span />
                      </div>
                    ) : null}
                    {!globalSearchLoading && globalSearchUnavailableTypes.length ? (
                      <div className={layoutStyles.searchWarning} role="status">
                        Some results are unavailable: {globalSearchUnavailableTypes.join(", ")}.
                      </div>
                    ) : null}
                    {globalSearchLoaded && !globalSearchLoading && normalizedNavSearch.length >= 2 && !paletteResults.length ? (
                      <div className={layoutStyles.searchEmpty}>
                        <Search size={28} aria-hidden="true" />
                        <strong>No results found</strong>
                        <span>Nothing matches “{navSearch.trim()}”.</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <footer className={layoutStyles.searchPaletteFooter}>
                <span className={layoutStyles.searchFooterHint}>Search across your Bickers workspace</span>
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> open</span>
                <span><kbd>esc</kbd> close</span>
              </footer>
            </section>
          </div>
        ) : null}

        {/* Content */}
        <div
          className={`app-shell-content ${layoutStyles.extracted43}`}
          ref={contentRef}

        >
          {children}
        </div>

        <Modal
          open={Boolean(pendingNavigation)}
          onClose={handleStayOnPage}
          title="Unsaved changes"
          description={pendingNavigation?.message}
          size="md"
          density="compact"
          footerClassName={layoutStyles.unsavedChangesFooter}
          footer={
            <>
              <Button variant="secondary" onClick={handleStayOnPage}>
                Stay on page
              </Button>
              <div className={layoutStyles.unsavedChangesActions}>
                <Button variant="danger" onClick={handleLeaveWithoutSaving}>
                  Leave without saving
                </Button>
                {pendingNavigation?.canSave ? (
                  <Button onClick={handleSaveAndLeave}>{pendingNavigation.saveLabel}</Button>
                ) : null}
              </div>
            </>
          }
        />

        {/* Footer */}
        <footer className={layoutStyles.footer}>
          <span>Copyright {new Date().getFullYear()} {appearance.theme.appName === DEFAULT_GLOBAL_THEME.appName ? "Bickers Booking System" : appearance.theme.appName} v{APP_VERSION_LABEL}</span>
          <div
            className={layoutStyles.extracted41}
          >
            {/* style-audit-allow runtime: access state tone */}
            <span className={layoutStyles.accessPill} style={{ "--access-border": pageAccessTone.border, "--access-background": pageAccessTone.background, "--access-text": pageAccessTone.text }}
              title={pageAccess.detail}
              aria-label={`Page access ${pageAccess.label}: ${pageAccess.detail}`}
            >
              {/* style-audit-allow runtime: access state dot */}
              <span className={layoutStyles.accessDot} style={{ "--access-dot": pageAccessTone.dot }} />
              Page: {pageAccess.label}
            </span>
            {/* style-audit-allow runtime: data-access state tone */}
            <span className={layoutStyles.accessPill} style={{ "--access-border": dataAccessTone.border, "--access-background": dataAccessTone.background, "--access-text": dataAccessTone.text }}
              title={dataAccess.detail}
              aria-label={`Data access ${dataAccess.label}: ${dataAccess.detail}`}
            >
              {/* style-audit-allow runtime: data-access state dot */}
              <span className={layoutStyles.accessDot} style={{ "--access-dot": dataAccessTone.dot }} />
              Data: {dataAccess.label}
            </span>
            {canSeePlatformAdmin ? (
              <Button bare
                type="button"
                onClick={() => attemptNavigation(() => router.push("/platform-admin"))}
                className={layoutStyles.extracted42}
                title="Open Platform Admin"
              >
                Platform
              </Button>
            ) : null}
          </div>
        </footer>
      </div>
      </div>
    </PersistentShellContext.Provider>
  );
}
