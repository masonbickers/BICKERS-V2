"use client";

import { useCallback, useEffect, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";

export default function DeletedQuotesAdminPage() {
  const { user } = useAuth() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await user?.getIdToken?.();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/quotes/deleted", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not load deleted quotes.");
      setRows(Array.isArray(data.deletedQuotes) ? data.deletedQuotes : []);
    } catch (loadError) {
      setError(loadError?.message || "Could not load deleted quotes.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [load, user]);

  const restore = async (row) => {
    if (!window.confirm(`Restore quote ${row.quoteNumber || row.id}?`)) return;
    setRestoring(row.id);
    setError("");
    try {
      const token = await user?.getIdToken?.();
      const response = await fetch(`/api/quotes/deleted/${encodeURIComponent(row.id)}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not restore quote.");
      await load();
    } catch (restoreError) {
      setError(restoreError?.message || "Could not restore quote.");
    } finally {
      setRestoring("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <main style={{ padding: 24, maxWidth: 1100 }}>
        <h1 style={{ margin: 0 }}>Deleted quote recovery</h1>
        <p style={{ color: "#64748b" }}>Quotes remain restorable for 30 days. Purge failures stay listed for investigation.</p>
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {loading ? <p>Loading…</p> : null}
        {!loading && !rows.length ? <p>No deleted quotes are awaiting purge.</p> : null}
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <article key={row.id} style={{ border: "1px solid #d7dee8", borderRadius: 10, padding: 14, background: "#fff" }}>
              <strong>{row.quoteNumber || "Unnamed quote"}</strong>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                {row.originalMetadata?.jobNumber || row.bookingId} · deleted {String(row.deletedAt || "-")} · purge after {String(row.purgeAfter || "-")}
              </div>
              {row.purgeError ? <p style={{ color: "#b91c1c" }}>Purge attempt failed: {row.purgeError}</p> : null}
              <button type="button" disabled={restoring === row.id} onClick={() => restore(row)} style={{ marginTop: 10 }}>
                {restoring === row.id ? "Restoring…" : "Restore quote"}
              </button>
            </article>
          ))}
        </div>
      </main>
    </HeaderSidebarLayout>
  );
}
