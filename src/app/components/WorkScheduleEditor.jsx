"use client";

import { DEFAULT_WORK_SCHEDULE, WEEK_DAYS, normalizeWorkSchedule } from "@/app/utils/activityTracking";

const LABELS = Object.fromEntries(WEEK_DAYS.map((day) => [day, day[0].toUpperCase() + day.slice(1)]));

export default function WorkScheduleEditor({ value, onChange, disabled = false, compact = false }) {
  const schedule = normalizeWorkSchedule(value || DEFAULT_WORK_SCHEDULE);
  const updateDay = (day, patch) => onChange?.({
    ...schedule,
    days: { ...schedule.days, [day]: { ...schedule.days[day], ...patch } },
  });

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!compact && (
        <div style={{ color: "var(--color-text-muted)", fontSize: 12, lineHeight: 1.45 }}>
          Used only to identify possible out-of-hours system activity. It does not change timesheets or payroll.
        </div>
      )}
      <label style={{ display: "grid", gap: 5, maxWidth: 280, fontSize: 12, fontWeight: 800 }}>
        Timezone
        <select
          value={schedule.timezone}
          disabled={disabled}
          onChange={(event) => onChange?.({ ...schedule, timezone: event.target.value })}
          style={inputStyle}
        >
          <option value="Europe/London">Europe/London</option>
        </select>
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        {WEEK_DAYS.map((day) => {
          const entry = schedule.days[day];
          return (
            <div key={day} style={rowStyle}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 118, fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={entry.working}
                  disabled={disabled}
                  onChange={(event) => updateDay(day, { working: event.target.checked })}
                />
                {LABELS[day]}
              </label>
              {entry.working ? (
                <>
                  <input aria-label={`${LABELS[day]} start`} type="time" value={entry.start} disabled={disabled} onChange={(event) => updateDay(day, { start: event.target.value })} style={timeStyle} />
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>to</span>
                  <input aria-label={`${LABELS[day]} end`} type="time" value={entry.end} disabled={disabled} onChange={(event) => updateDay(day, { end: event.target.value })} style={timeStyle} />
                </>
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Non-working day</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle = { minHeight: 38, border: "1px solid var(--color-border)", borderRadius: 9, padding: "7px 10px", background: "var(--color-surface)", color: "var(--color-text)" };
const timeStyle = { ...inputStyle, minHeight: 34, padding: "5px 8px", width: 112 };
const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "7px 9px", border: "1px solid var(--color-border)", borderRadius: 9, background: "var(--color-surface-subtle)" };
