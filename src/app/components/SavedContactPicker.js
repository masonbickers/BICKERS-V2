"use client";

import { Check, Search, UserRoundPlus } from "lucide-react";
import { Button, Input } from "@/app/components/ui";
import styles from "./SavedContactPicker.module.css";

const contactIdentity = (contact = {}) =>
  String(contact.email || contact.phone || contact.number || contact.name || contact.id || "")
    .trim()
    .toLowerCase();

export default function SavedContactPicker({
  contacts = [],
  existingContacts = [],
  loaded = false,
  loading = false,
  query = "",
  onQueryChange,
  onLoad,
  onSelect,
}) {
  const existingKeys = new Set(existingContacts.map(contactIdentity).filter(Boolean));
  const visibleContacts = query.trim() ? contacts.slice(0, 8) : [];

  return (
    <section className={styles.picker} aria-labelledby="saved-contact-picker-title">
      <div className={styles.heading}>
        <div>
          <h4 id="saved-contact-picker-title">Add from saved contacts</h4>
          <p>Search by name, department, email or phone.</p>
        </div>
      </div>

      {!loaded ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onLoad}
          loading={loading}
          className={styles.loadButton}
        >
          <UserRoundPlus size={16} /> Browse saved contacts
        </Button>
      ) : (
        <>
          <label className={styles.searchField}>
            <Search size={17} aria-hidden="true" />
            <span className={styles.srOnly}>Search saved contacts</span>
            <Input
              bare
              type="search"
              value={query}
              onChange={(event) => onQueryChange?.(event.target.value)}
              placeholder="Start typing a name or company role…"
              autoComplete="off"
            />
          </label>

          <div className={styles.results} aria-live="polite">
            {!query.trim() ? (
              <div className={styles.guidance}>Start typing to find a saved contact.</div>
            ) : visibleContacts.length === 0 ? (
              <div className={styles.empty}>No saved contacts match “{query.trim()}”.</div>
            ) : (
              visibleContacts.map((contact) => {
                const identity = contactIdentity(contact);
                const alreadyAdded = existingKeys.has(identity);
                const name = contact.name || contact.email || "Unnamed contact";
                const detail = [
                  contact.department,
                  contact.email && contact.email !== name ? contact.email : "",
                  contact.phone || contact.number,
                ].filter(Boolean).join(" · ");

                return (
                  <button
                    key={contact.id || identity}
                    type="button"
                    className={styles.result}
                    onClick={() => {
                      if (alreadyAdded) return;
                      onSelect?.(contact.id, contact);
                      onQueryChange?.("");
                    }}
                    disabled={alreadyAdded}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      {String(name).trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className={styles.identity}>
                      <strong>{name}</strong>
                      <small>{detail || "No additional details"}</small>
                    </span>
                    <span className={styles.action}>
                      {alreadyAdded ? <><Check size={14} /> Added</> : <><UserRoundPlus size={14} /> Add</>}
                    </span>
                  </button>
                );
              })
            )}

            {query.trim() && contacts.length > visibleContacts.length ? (
              <div className={styles.more}>Showing the first {visibleContacts.length} matches—refine your search for more.</div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
