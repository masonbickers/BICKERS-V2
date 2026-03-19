"use client";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { db } from "../../../firebaseConfig";
import {
  findEmployeeForUser,
  getStoredActiveWorkspace,
  isPathAllowedForAccess,
  resolveEmployeeAccess,
  selectLandingRoute,
} from "@/app/utils/accessControl";

const PUBLIC_PATHS = ["/login", "/setup-mfa", "/verify-mfa"];

export default function ProtectedLayout({ children }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const isPublic = PUBLIC_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      );

      if (!currentUser) {
        setLoading(false);
        if (!isPublic) router.push("/login");
        return;
      }

      if (isPublic) {
        setLoading(false);
        return;
      }

      try {
        const [userSnap, employeeDoc] = await Promise.all([
          getDoc(doc(db, "users", currentUser.uid)),
          findEmployeeForUser(db, currentUser),
        ]);

        const isAdmin = String(userSnap.data()?.role || "").toLowerCase() === "admin";
        const access = resolveEmployeeAccess(employeeDoc || {}, { isAdmin });

        if (!isPathAllowedForAccess(pathname, access)) {
          const preferred =
            typeof window !== "undefined"
              ? getStoredActiveWorkspace(window.localStorage) ||
                getStoredActiveWorkspace(window.sessionStorage)
              : null;

          router.replace(selectLandingRoute(access, preferred));
          return;
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  return <>{children}</>;
}
