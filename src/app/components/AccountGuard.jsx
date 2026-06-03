"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth } from "@/app/context/authContext";
import { auth } from "../../../firebaseConfig";

export default function AccountGuard() {
  const router = useRouter();
  const { user, accessReady, userDoc, isEnabled } = useAuth() || {};

  useEffect(() => {
    if (!user || !accessReady) return;

    const role = String(userDoc?.role || "").trim().toLowerCase();
    const blocked =
      isEnabled === false ||
      userDoc?.active === false ||
      userDoc?.archived === true ||
      userDoc?.isArchived === true ||
      userDoc?.disabled === true ||
      userDoc?.appDisabled === true ||
      role === "archived";

    if (!blocked) return;

    let cancelled = false;
    const disableAccount = async () => {
      try {
        await signOut(auth);
      } finally {
        if (!cancelled) router.push("/login?disabled=1");
      }
    };
    disableAccount();

    return () => {
      cancelled = true;
    };
  }, [accessReady, isEnabled, router, user, userDoc]);

  return null;
}
