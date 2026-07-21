"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { onAuthStateChanged, signInWithCustomToken, signOut as signOutFirebase } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/app/utils/firebaseClient";
import {
  hasMirroredAccessRecord,
  normalizeFeatureFlags,
  normalizePlatformRole,
  resolveEmployeeAccess,
} from "@/app/utils/accessControl";
import { isAccountDisabled } from "@/app/utils/accountAccess";
import {
  hasAuthenticatorMfa,
  isMfaVerifiedOnDevice,
  isPhoneVerified,
} from "@/app/utils/authSecurity";

const AuthContext = createContext(null);
const ACCESS_CACHE_KEY = "bickers-auth-access-cache:v2";
const ADMIN_VIEW_MODE_KEY = "bickers-admin-view-mode:v1";
const ADMIN_VIEW_USER_KEY = "bickers-admin-view-user:v1";
const ADMIN_VIEW_EMAILS = new Set(["mason@bickers.co.uk"]);
const SESSION_BRIDGE_RETRY_DELAYS_MS = [0, 400, 1200];
const SESSION_BRIDGE_BACKGROUND_RETRY_MS = 5000;

const wait = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

async function requestFirebaseSessionToken() {
  let lastError = null;

  for (const delayMs of SESSION_BRIDGE_RETRY_DELAYS_MS) {
    if (delayMs) await wait(delayMs);

    try {
      const res = await fetch("/api/auth/firebase-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.customToken) return data.customToken;

      const error = new Error(data?.error || "Could not start the application session.");
      error.status = res.status;
      lastError = error;
      if (res.status === 403) throw error;
    } catch (error) {
      lastError = error;
      if (error?.status === 403) throw error;
    }
  }

  throw lastError || new Error("Could not start the application session.");
}

const debugBookingLoads = (...args) => {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("debugBookingLoads") === "1") {
      console.log("[booking-load]", ...args);
    }
  } catch {
    // Debug logging is optional.
  }
};

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const emptyAccess = {
  user: null,
  userDoc: null,
  employeeAccess: null,
  featureFlags: normalizeFeatureFlags(),
  isAdmin: false,
  isEnabled: true,
  phoneReady: false,
  mfaReady: false,
  mfaPassed: false,
  accessReady: false,
};

const readAccessCache = (uid) => {
  if (typeof window === "undefined" || !uid) return null;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(ACCESS_CACHE_KEY) || "null");
    if (cached?.uid !== uid) return null;
    return cached.value || null;
  } catch {
    return null;
  }
};

const writeAccessCache = (uid, value) => {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ uid, value }));
  } catch {
    // Cache is optional.
  }
};

const clearAccessCache = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACCESS_CACHE_KEY);
  } catch {
    // Cache is optional.
  }
};

const readAdminViewMode = (email) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!ADMIN_VIEW_EMAILS.has(cleanEmail)) return "admin";
  if (typeof window === "undefined") return "admin";
  try {
    return window.localStorage.getItem(ADMIN_VIEW_MODE_KEY) === "user" ? "user" : "admin";
  } catch {
    return "admin";
  }
};

const writeAdminViewMode = (mode) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_VIEW_MODE_KEY, mode === "user" ? "user" : "admin");
  } catch {
    // View mode is optional.
  }
};

const readAdminViewUser = (email) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!ADMIN_VIEW_EMAILS.has(cleanEmail)) return null;
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(ADMIN_VIEW_USER_KEY) || "null");
  } catch {
    return null;
  }
};

const writeAdminViewUser = (userDoc) => {
  if (typeof window === "undefined") return;
  try {
    if (!userDoc) {
      window.localStorage.removeItem(ADMIN_VIEW_USER_KEY);
      return;
    }
    window.localStorage.setItem(ADMIN_VIEW_USER_KEY, JSON.stringify(userDoc));
  } catch {
    // View-as selection is optional.
  }
};

const readStoredMfaPassed = (uid) =>
  isMfaVerifiedOnDevice(
    typeof window !== "undefined" ? window.localStorage : null,
    typeof window !== "undefined" ? window.sessionStorage : null,
    uid
  );

async function resolveUserDoc(currentUser) {
  const resolvedRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(resolvedRef);

  return {
    resolvedRef,
    userDoc: snap?.exists?.() ? snap.data() || {} : {},
  };
}

async function refreshServerAccess(currentUser) {
  if (!currentUser?.getIdToken || typeof fetch !== "function") {
    throw new Error("Firebase access verification is unavailable.");
  }

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/security/bootstrap-access", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access) {
      throw new Error(data?.error || "Your account access could not be verified.");
    }
    return data.access;
  } catch (error) {
    console.warn("[authContext] access bootstrap failed:", error);
    throw error;
  }
}

async function resolveFeatureFlags(userDoc = {}) {
  return normalizeFeatureFlags(userDoc?.featureFlags || userDoc?.features || {});
}

const resolveAccessState = async (currentUser, userDoc) => {
  const isEnabled = Boolean(userDoc?.uid) && !isAccountDisabled(userDoc);
  const role = normalizePlatformRole(userDoc?.role);
  const isAdmin = role === "admin" || role === "platformAdmin";
  const accessSource = hasMirroredAccessRecord(userDoc || {}) ? userDoc || {} : {};
  const employeeAccess = resolveEmployeeAccess(accessSource, { isAdmin });
  const phoneReady = isPhoneVerified(userDoc || {});
  const mfaReady = hasAuthenticatorMfa(userDoc || {});
  const mfaPassed = readStoredMfaPassed(currentUser.uid);
  const featureFlags = await resolveFeatureFlags(userDoc || {});

  return {
    userDoc: userDoc || {},
    employeeAccess,
    featureFlags,
    isAdmin,
    isEnabled,
    phoneReady,
    mfaReady,
    mfaPassed,
    accessReady: true,
  };
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut: signOutClerk } = useClerk();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accessState, setAccessState] = useState(emptyAccess);
  const [adminViewMode, setAdminViewModeState] = useState("admin");
  const [adminViewUser, setAdminViewUserState] = useState(null);
  const userDocUnsubRef = useRef(null);
  const resolvingRef = useRef(0);
  const bridgeRetryTimerRef = useRef(null);
  const [bridgeRetryNonce, setBridgeRetryNonce] = useState(0);
  const clerkUserId = String(clerkUser?.id || "");

  useEffect(() => {
    if (!clerkLoaded) return undefined;

    let cancelled = false;
    if (bridgeRetryTimerRef.current) {
      clearTimeout(bridgeRetryTimerRef.current);
      bridgeRetryTimerRef.current = null;
    }

    const syncClerkSessionToFirebase = async () => {
      if (!isSignedIn || !clerkUserId) {
        setBridgeReady(false);
        setLoading(true);
        setAuthError("");
        clearAccessCache();
        await signOutFirebase(auth).catch(() => {});
        if (!cancelled) setBridgeReady(true);
        return;
      }

      const existingFirebaseUser = auth.currentUser;
      if (!existingFirebaseUser && bridgeRetryNonce === 0) {
        setBridgeReady(false);
        setLoading(true);
      }

      try {
        if (existingFirebaseUser?.getIdTokenResult) {
          try {
            const tokenResult = await existingFirebaseUser.getIdTokenResult();
            if (String(tokenResult?.claims?.clerkUserId || "") === clerkUserId) {
              if (!cancelled) {
                setAuthError("");
                setBridgeReady(true);
                if (bridgeRetryNonce !== 0) setBridgeRetryNonce(0);
              }
              return;
            }
          } catch {
            // The persisted token may be stale; request a replacement below.
          }

          // Never expose a Firebase session belonging to a different Clerk
          // identity while the replacement bridge is being established.
          setBridgeReady(false);
          setLoading(true);
          await signOutFirebase(auth).catch(() => {});
        }

        const customToken = await requestFirebaseSessionToken();
        await signInWithCustomToken(auth, customToken);
        if (!cancelled) {
          setAuthError("");
          setBridgeReady(true);
          if (bridgeRetryNonce !== 0) setBridgeRetryNonce(0);
        }
      } catch (error) {
        console.warn("[authContext] Clerk session bridge unavailable:", error);

        if (error?.status === 403) {
          clearAccessCache();
          await signOutFirebase(auth).catch(() => {});
          if (!cancelled) {
            setAuthError(error?.message || "Your account could not be linked.");
            setBridgeReady(true);
            await signOutClerk({ redirectUrl: "/login?access=denied" }).catch(() => {});
          }
          return;
        }

        if (!cancelled) {
          // Keep the Clerk login intact during a temporary outage and retry
          // quietly instead of throwing the user back to the login page.
          setAuthError(
            error?.message || "Your session is temporarily unavailable. Retrying..."
          );
          setBridgeReady(true);
          bridgeRetryTimerRef.current = setTimeout(() => {
            setBridgeRetryNonce((value) => value + 1);
          }, SESSION_BRIDGE_BACKGROUND_RETRY_MS);
        }
      }
    };

    syncClerkSessionToFirebase();
    return () => {
      cancelled = true;
      if (bridgeRetryTimerRef.current) {
        clearTimeout(bridgeRetryTimerRef.current);
        bridgeRetryTimerRef.current = null;
      }
    };
  }, [bridgeRetryNonce, clerkLoaded, clerkUserId, isSignedIn, signOutClerk]);

  useEffect(() => {
    if (!clerkLoaded || !bridgeReady) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const startedAt = nowMs();
      resolvingRef.current += 1;
      const token = resolvingRef.current;

      if (userDocUnsubRef.current) {
        userDocUnsubRef.current();
        userDocUnsubRef.current = null;
      }

      setUser(firebaseUser);
      setAdminViewModeState(readAdminViewMode(firebaseUser?.email));
      setAdminViewUserState(readAdminViewUser(firebaseUser?.email));

      if (!firebaseUser) {
        clearAccessCache();
        setAccessState(emptyAccess);
        setLoading(false);
        return;
      }

      setAccessState({ ...emptyAccess, user: firebaseUser, accessReady: false });
      setLoading(false);

      try {
        clearAccessCache();
        const refreshedAccess = await refreshServerAccess(firebaseUser);
        let resolvedRef = doc(db, "users", firebaseUser.uid);
        let userDoc = refreshedAccess || {};

        try {
          const resolved = await resolveUserDoc(firebaseUser);
          resolvedRef = resolved.resolvedRef;
          userDoc = { ...resolved.userDoc, ...(refreshedAccess || {}) };
        } catch (error) {
          console.warn("[authContext] user doc read failed after bootstrap:", error);
        }
        if (token !== resolvingRef.current) return;

        if (!userDoc?.uid || isAccountDisabled(userDoc)) {
          clearAccessCache();
          setAccessState(emptyAccess);
          await signOutFirebase(auth);
          await signOutClerk({ redirectUrl: "/login?disabled=1" }).catch(() => {});
          return;
        }

        const nextAccess = await resolveAccessState(firebaseUser, userDoc);
        if (token !== resolvingRef.current) return;

        setAccessState(nextAccess);
        writeAccessCache(firebaseUser.uid, nextAccess);
        debugBookingLoads("auth/access ready", Math.round(nowMs() - startedAt), "ms");

        userDocUnsubRef.current = onSnapshot(
          resolvedRef,
          async (docSnap) => {
            const liveUserDoc = docSnap.data() || {};
            if (!liveUserDoc?.uid || isAccountDisabled(liveUserDoc)) {
              clearAccessCache();
              setAccessState(emptyAccess);
              await signOutFirebase(auth);
              await signOutClerk({ redirectUrl: "/login?disabled=1" }).catch(() => {});
              return;
            }

            const liveAccess = await resolveAccessState(firebaseUser, liveUserDoc);
            setAccessState(liveAccess);
            writeAccessCache(firebaseUser.uid, liveAccess);
          },
          (error) => {
            console.warn("[authContext] live user doc listener failed:", error);
          }
        );
      } catch (error) {
        console.error("[authContext] access resolution failed:", error);
        clearAccessCache();
        setAuthError(error?.message || "Your account access could not be verified.");
        setAccessState(emptyAccess);
        await signOutFirebase(auth).catch(() => {});
        await signOutClerk({ redirectUrl: "/login?access=denied" }).catch(() => {});
      }
    });

    return () => {
      unsubscribe();
      if (userDocUnsubRef.current) userDocUnsubRef.current();
    };
  }, [bridgeReady, clerkLoaded, signOutClerk]);

  const refreshMfaState = useCallback(() => {
    const uid = auth.currentUser?.uid || user?.uid;
    if (!uid) return false;
    const nextMfaPassed = readStoredMfaPassed(uid);
    setAccessState((prev) => ({
      ...prev,
      mfaPassed: nextMfaPassed,
    }));
    return nextMfaPassed;
  }, [user?.uid]);

  const setAdminViewMode = useCallback(
    (mode) => {
      const cleanEmail = String(user?.email || "").trim().toLowerCase();
      if (!ADMIN_VIEW_EMAILS.has(cleanEmail)) return;
      const nextMode = mode === "user" ? "user" : "admin";
      writeAdminViewMode(nextMode);
      setAdminViewModeState(nextMode);
    },
    [user?.email]
  );

  const setAdminViewUser = useCallback(
    (userDoc) => {
      const cleanEmail = String(user?.email || "").trim().toLowerCase();
      if (!ADMIN_VIEW_EMAILS.has(cleanEmail)) return;
      const nextUserDoc = userDoc ? { ...userDoc } : null;
      writeAdminViewUser(nextUserDoc);
      setAdminViewUserState(nextUserDoc);
      if (nextUserDoc) {
        writeAdminViewMode("user");
        setAdminViewModeState("user");
      }
    },
    [user?.email]
  );

  const canUseAdminViewSwitch = ADMIN_VIEW_EMAILS.has(String(user?.email || "").trim().toLowerCase());
  const effectiveIsAdmin = accessState.isAdmin && (!canUseAdminViewSwitch || adminViewMode !== "user");
  const effectiveUserDoc = useMemo(() => {
    if (!canUseAdminViewSwitch || adminViewMode !== "user") return accessState.userDoc;
    return {
      ...(accessState.userDoc || {}),
      ...(adminViewUser || {}),
      role: "user",
      appAccess:
        adminViewUser?.appAccess && typeof adminViewUser.appAccess === "object"
          ? adminViewUser.appAccess
          : { user: true, service: false },
      defaultWorkspace: adminViewUser?.defaultWorkspace || "user",
    };
  }, [accessState.userDoc, adminViewMode, adminViewUser, canUseAdminViewSwitch]);
  const effectiveEmployeeAccess = useMemo(
    () =>
      adminViewMode === "user" && canUseAdminViewSwitch
        ? resolveEmployeeAccess(effectiveUserDoc, { isAdmin: false })
        : accessState.employeeAccess,
    [accessState.employeeAccess, adminViewMode, canUseAdminViewSwitch, effectiveUserDoc]
  );
  const effectiveUser = useMemo(() => {
    if (!user || !canUseAdminViewSwitch || adminViewMode !== "user" || !adminViewUser) return user;
    return {
      ...user,
      uid: adminViewUser.uid || adminViewUser.id || user.uid,
      email: adminViewUser.email || user.email,
      displayName: adminViewUser.name || adminViewUser.displayName || user.displayName,
      getIdToken: (...args) => user.getIdToken(...args),
      getIdTokenResult: (...args) => user.getIdTokenResult(...args),
    };
  }, [adminViewMode, adminViewUser, canUseAdminViewSwitch, user]);

  const logout = useCallback(async () => {
    clearAccessCache();
    await signOutFirebase(auth).catch(() => {});
    await signOutClerk({ redirectUrl: "/login" });
  }, [signOutClerk]);

  const value = useMemo(
    () => ({
      user: effectiveUser,
      realUser: user,
      loading,
      logout,
      authError,
      clerkUser,
      userDoc: effectiveUserDoc,
      employeeAccess: effectiveEmployeeAccess,
      featureFlags: accessState.featureFlags,
      isAdmin: effectiveIsAdmin,
      isEnabled: accessState.isEnabled,
      phoneReady: accessState.phoneReady,
      mfaReady: accessState.mfaReady,
      mfaPassed: accessState.mfaPassed,
      refreshMfaState,
      accessReady: accessState.accessReady,
      accessLoading: !!user && !accessState.accessReady,
      canUseAdminViewSwitch,
      adminViewMode: canUseAdminViewSwitch ? adminViewMode : "admin",
      setAdminViewMode,
      adminViewUser: canUseAdminViewSwitch ? adminViewUser : null,
      adminViewUserId: canUseAdminViewSwitch ? String(adminViewUser?.uid || adminViewUser?.id || "") : "",
      setAdminViewUser,
    }),
    [
      user,
      effectiveUser,
      loading,
      accessState,
      effectiveUserDoc,
      effectiveEmployeeAccess,
      effectiveIsAdmin,
      refreshMfaState,
      canUseAdminViewSwitch,
      adminViewMode,
      setAdminViewMode,
      adminViewUser,
      setAdminViewUser,
      logout,
      authError,
      clerkUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
