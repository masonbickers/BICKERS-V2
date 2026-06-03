"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/app/utils/firebaseClient";
import {
  hasMirroredAccessRecord,
  normalizeFeatureFlags,
  normalizePlatformRole,
  resolveEmployeeAccess,
} from "@/app/utils/accessControl";
import { isAdminEmail } from "@/app/utils/adminAccess";
import {
  hasAuthenticatorMfa,
  isMfaVerifiedOnDevice,
  isPhoneVerified,
} from "@/app/utils/authSecurity";

const AuthContext = createContext(null);
const ACCESS_CACHE_KEY = "bickers-auth-access-cache:v2";

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
  if (!currentUser?.getIdToken || typeof fetch !== "function") return null;

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/security/bootstrap-access", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.access || null;
  } catch (error) {
    console.warn("[authContext] access bootstrap failed:", error);
    return null;
  }
}

async function resolveFeatureFlags(userDoc = {}) {
  return normalizeFeatureFlags(userDoc?.featureFlags || userDoc?.features || {});
}

const resolveAccessState = async (currentUser, userDoc) => {
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const isEnabled = userDoc?.isEnabled !== false;
  const role = normalizePlatformRole(userDoc?.role);
  const isAdmin = isAdminEmail(email) || role === "admin" || role === "platformAdmin";
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState(emptyAccess);
  const userDocUnsubRef = useRef(null);
  const resolvingRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const startedAt = nowMs();
      resolvingRef.current += 1;
      const token = resolvingRef.current;

      if (userDocUnsubRef.current) {
        userDocUnsubRef.current();
        userDocUnsubRef.current = null;
      }

      setUser(firebaseUser);

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

        if (userDoc?.isEnabled === false) {
          clearAccessCache();
          setAccessState(emptyAccess);
          await signOut(auth);
          return;
        }

        const nextAccess = await resolveAccessState(firebaseUser, userDoc);
        if (token !== resolvingRef.current) return;

        setAccessState(nextAccess);
        writeAccessCache(firebaseUser.uid, nextAccess);
        debugBookingLoads("auth/access ready", Math.round(nowMs() - startedAt), "ms");

        userDocUnsubRef.current = onSnapshot(resolvedRef, async (docSnap) => {
          const liveUserDoc = docSnap.data() || {};
          if (liveUserDoc?.isEnabled === false) {
            clearAccessCache();
            setAccessState(emptyAccess);
            await signOut(auth);
            return;
          }

          const liveAccess = await resolveAccessState(firebaseUser, liveUserDoc);
          setAccessState(liveAccess);
          writeAccessCache(firebaseUser.uid, liveAccess);
        });
      } catch (error) {
        console.error("[authContext] access resolution failed:", error);
        setAccessState((prev) => ({ ...prev, accessReady: Boolean(prev.employeeAccess) }));
      }
    });

    return () => {
      unsubscribe();
      if (userDocUnsubRef.current) userDocUnsubRef.current();
    };
  }, []);

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

  const value = useMemo(
    () => ({
      user,
      loading,
      logout: () => signOut(auth),
      userDoc: accessState.userDoc,
      employeeAccess: accessState.employeeAccess,
      featureFlags: accessState.featureFlags,
      isAdmin: accessState.isAdmin,
      isEnabled: accessState.isEnabled,
      phoneReady: accessState.phoneReady,
      mfaReady: accessState.mfaReady,
      mfaPassed: accessState.mfaPassed,
      refreshMfaState,
      accessReady: accessState.accessReady,
      accessLoading: !!user && !accessState.accessReady,
    }),
    [user, loading, accessState, refreshMfaState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
