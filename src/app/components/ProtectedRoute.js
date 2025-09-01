"use client";

import { useAuth } from "../context/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login"); // 🚪 redirect if not logged in
    }
  }, [user, loading, router]);

  if (loading) return <p>Loading...</p>;

  return user ? children : null;
}
