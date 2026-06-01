"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/app/utils/firebaseClient";
import {
  findEmployeeForUser,
  hasMirroredAccessRecord,
  resolveEmployeeAccess,
} from "@/app/utils/accessControl";
import {
  hasAuthenticatorMfa,
  isMfaVerifiedOnDevice,
  isPhoneVerified,
} from "@/app/utils/authSecurity";

const AuthContext = createContext(null);
const ACCESS_CACHE_KEY = "bickers-auth-access-cache:v1";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

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
  let resolvedRef = doc(db, "users", currentUser.uid);
  let snap = await getDoc(resolvedRef);

  if (!snap.exists()) {
    const emailA = String(currentUser.email || "").trim();
    const emailB = emailA.toLowerCase();

    const q1 = query(collection(db, "users"), where("email", "==", emailA), limit(1));
    const r1 = await getDocs(q1);

    if (!r1.empty) {
      resolvedRef = doc(db, "users", r1.docs[0].id);
      snap = r1.docs[0];
    } else {
      const q2 = query(collection(db, "users"), where("email", "==", emailB), limit(1));
      const r2 = await getDocs(q2);
      if (!r2.empty) {
        resolvedRef = doc(db, "users", r2.docs[0].id);
        snap = r2.docs[0];
      }
    }
  }

  return {
    resolvedRef,
    userDoc: snap?.exists?.() ? snap.data() || {} : {},
  };
}

async function refreshServerAccess(currentUser) {
  if (!currentUser?.getIdToken || typeof fetch !== "function") return false;

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/security/bootstrap-access", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch (error) {
    console.warn("[authContext] access bootstrap failed:", error);
    return false;
  }
}

const resolveAccessState = async (currentUser, userDoc) => {
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const isEnabled = userDoc?.isEnabled !== false;
  const isAdmin = ADMIN_EMAILS.includes(email) || userDoc?.role === "admin";
  const accessSource = hasMirroredAccessRecord(userDoc || {})
    ? userDoc || {}
    : (await findEmployeeForUser(db, currentUser)) || {};
  const employeeAccess = resolveEmployeeAccess(accessSource, { isAdmin });
  const phoneReady = isPhoneVerified(userDoc || {});
  const mfaReady = hasAuthenticatorMfa(userDoc || {});
  const mfaPassed = readStoredMfaPassed(currentUser.uid);

  return {
    userDoc: userDoc || {},
    employeeAccess,
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

      const cached = readAccessCache(firebaseUser.uid);
      if (cached) {
        setAccessState({
          ...cached,
          mfaPassed: readStoredMfaPassed(firebaseUser.uid),
          accessReady: true,
        });
        debugBookingLoads("auth/access cache ready", Math.round(nowMs() - startedAt), "ms");
      } else {
        setAccessState({ ...emptyAccess, user: firebaseUser, accessReady: false });
      }
      setLoading(false);

      try {
        let { resolvedRef, userDoc } = await resolveUserDoc(firebaseUser);
        if (token !== resolvingRef.current) return;

        if (userDoc?.isEnabled === false) {
          clearAccessCache();
          setAccessState(emptyAccess);
          await signOut(auth);
          return;
        }

        const refreshed = await refreshServerAccess(firebaseUser);
        if (refreshed) {
          const fresh = await resolveUserDoc(firebaseUser);
          resolvedRef = fresh.resolvedRef;
          userDoc = fresh.userDoc;
        }
        if (token !== resolvingRef.current) return;

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
