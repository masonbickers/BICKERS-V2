// /src/app/page.js
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectHome() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, []);

  return null;
}
