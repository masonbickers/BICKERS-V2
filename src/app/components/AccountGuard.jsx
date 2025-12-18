"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";

export default function AccountGuard() {
  const router = useRouter();
  const unsubUserRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // stop any previous listener
      if (unsubUserRef.current) {
        unsubUserRef.current();
        unsubUserRef.current = null;
      }

      if (!user) return;

      const userRef = doc(db, "users", user.uid);

      // live watch for disable
      unsubUserRef.current = onSnapshot(
        userRef,
        async (snap) => {
          const data = snap.data();
          if (data?.isEnabled === false) {
            try {
              await signOut(auth);
            } finally {
              router.push("/login?disabled=1");
            }
          }
        },
        // if you want, you can also log out on permission errors
        async () => {
          try {
            await signOut(auth);
          } finally {
            router.push("/login");
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserRef.current) unsubUserRef.current();
    };
  }, [router]);

  return null;
}
