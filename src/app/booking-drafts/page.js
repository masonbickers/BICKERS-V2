"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  HardDrive,
  LayoutDashboard,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  OperationsHeaderActions,
  OperationsPage,
  OperationsPageHeader,
  OperationsToolbar,
} from "@/app/components/OperationsPage";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Table,
  TableContainer,
} from "@/app/components/ui";
import styles from "./page.styles.module.css";

const DRAFTS_STORAGE_KEY = "create-booking:drafts:v1";

const fmtDateTime = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const readDrafts = () => {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeDrafts = (map) => {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(map || {}));
  } catch {
    // Draft updates should not prevent the page from continuing to work.
  }
};

export default function BookingDraftsPage() {
  const router = useRouter();
  const [draftMap, setDraftMap] = useState({});
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftPendingDelete, setDraftPendingDelete] = useState(null);

  useEffect(() => {
    const refresh = () => {
      setDraftMap(readDrafts());
      setHasLoaded(true);
    };

    refresh();
    const onStorage = (event) => {
      if (event.key === DRAFTS_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const drafts = useMemo(
    () =>
      Object.values(draftMap || {}).sort((a, b) => {
        const at = new Date(a?.updatedAt || 0).getTime();
        const bt = new Date(b?.updatedAt || 0).getTime();
        return bt - at;
      }),
    [draftMap]
  );

  const filteredDrafts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return drafts;
    return drafts.filter((draft) => {
      const title = String(draft?.title || "Untitled Draft").toLowerCase();
      return title.includes(query) || fmtDateTime(draft?.updatedAt).toLowerCase().includes(query);
    });
  }, [drafts, searchQuery]);

  const removeDraft = () => {
    const id = draftPendingDelete?.id;
    if (!id) return;
    const next = { ...(draftMap || {}) };
    delete next[id];
    writeDrafts(next);
    setDraftMap(next);
    setDraftPendingDelete(null);
  };

  const openDraft = (id) => {
    router.push(`/create-booking?draft=${encodeURIComponent(id)}`);
  };

  return (
    <HeaderSidebarLayout>
      <OperationsPage>
        <OperationsPageHeader
          title="Booking Drafts"
          subtitle="Continue unfinished bookings that were saved automatically on this device."
          actions={
            <OperationsHeaderActions>
              <Button type="button" onClick={() => router.push("/create-booking")}>
                <Plus size={14} />
                New Booking
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push("/dashboard")}>
                <LayoutDashboard size={14} />
                Back to Diary
              </Button>
            </OperationsHeaderActions>
          }
        />

        <OperationsToolbar className={styles.toolbar}>
          <div className={styles.searchField}>
            <Search size={16} aria-hidden="true" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search drafts…"
              aria-label="Search booking drafts"
            />
          </div>
        </OperationsToolbar>

        <div className={styles.resultSummary} aria-live="polite">
          {filteredDrafts.length} of {drafts.length} drafts shown
        </div>

        {hasLoaded && drafts.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} aria-hidden="true" />}
            title="No booking drafts"
            description="Drafts appear here automatically after you start a new booking."
            action={
              <Button type="button" onClick={() => router.push("/create-booking")}>
                <Plus size={14} />
                Start a booking
              </Button>
            }
          />
        ) : hasLoaded && filteredDrafts.length === 0 ? (
          <EmptyState
            icon={<Search size={28} aria-hidden="true" />}
            title="No matching drafts"
            description={`No drafts match “${searchQuery.trim()}”.`}
            action={
              <Button variant="secondary" type="button" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <TableContainer className={styles.tableContainer}>
            <Table className={styles.table}>
              <thead>
                <tr>
                  <th>Draft</th>
                  <th>Last updated</th>
                  <th>Saved to</th>
                  <th className={styles.actionsHeading}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <div className={styles.draftIdentity}>
                        <span className={styles.draftIcon} aria-hidden="true">
                          <PencilLine size={16} />
                        </span>
                        <strong>{String(draft.title || "Untitled Draft")}</strong>
                      </div>
                    </td>
                    <td className={styles.updatedAt}>{fmtDateTime(draft.updatedAt)}</td>
                    <td>
                      <span className={styles.storageLabel}>
                        <HardDrive size={14} aria-hidden="true" />
                        This device
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button size="sm" type="button" onClick={() => openDraft(draft.id)}>
                          <PencilLine size={13} />
                          Open Draft
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className={styles.deleteButton}
                          aria-label={`Delete ${String(draft.title || "Untitled Draft")}`}
                          onClick={() => setDraftPendingDelete(draft)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}

        <Modal
          open={Boolean(draftPendingDelete)}
          onClose={() => setDraftPendingDelete(null)}
          title="Delete booking draft?"
          description={`“${String(draftPendingDelete?.title || "Untitled Draft")}” will be permanently removed from this device.`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDraftPendingDelete(null)}>
                Keep Draft
              </Button>
              <Button variant="danger" type="button" onClick={removeDraft}>
                <Trash2 size={14} />
                Delete Draft
              </Button>
            </>
          }
        />
      </OperationsPage>
    </HeaderSidebarLayout>
  );
}
