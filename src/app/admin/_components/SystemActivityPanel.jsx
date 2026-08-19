"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import styles from "./SystemActivityPanel.module.css";

const ymd = (value) => {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const shiftDay = (value, amount) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return ymd(date);
};

const actionTone = (value = "") => {
  const action = value.toLowerCase();
  if (action.includes("created") || action.includes("added")) return styles.actionCreated;
  if (action.includes("deleted") || action.includes("removed")) return styles.actionDeleted;
  if (action.includes("approved") || action.includes("completed")) return styles.actionApproved;
  return styles.actionEdited;
};

const initials = (value = "") => {
  const local = String(value).split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
};

export default function SystemActivityPanel({ rows = [], loading, day, onDayChange, onRefresh }) {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState("");

  const users = useMemo(() => [...new Set(rows.map((row) => row.user).filter(Boolean))].sort(), [rows]);
  const areas = useMemo(() => [...new Set(rows.map((row) => row.area || "Other"))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((row) => row.action || "Activity"))].sort(), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (userFilter !== "all" && row.user !== userFilter) return false;
      if (areaFilter !== "all" && (row.area || "Other") !== areaFilter) return false;
      if (actionFilter !== "all" && (row.action || "Activity") !== actionFilter) return false;
      if (!query) return true;
      return [row.user, row.action, row.area, row.details].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [actionFilter, areaFilter, rows, search, userFilter]);

  const hourly = useMemo(() => {
    const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
    filtered.forEach((row) => {
      if (!(row.at instanceof Date) || Number.isNaN(row.at.getTime())) return;
      counts[row.at.getHours()].value += 1;
    });
    return counts;
  }, [filtered]);
  const max = Math.max(1, ...hourly.map((item) => item.value));
  const busiest = hourly.reduce((best, item) => item.value > best.value ? item : best, hourly[0]);
  const topArea = useMemo(() => {
    const counts = filtered.reduce((map, row) => {
      const area = row.area || "Other";
      map[area] = (map[area] || 0) + 1;
      return map;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  }, [filtered]);
  const activeUsers = new Set(filtered.map((row) => row.user).filter(Boolean)).size;
  const hasFilters = search || userFilter !== "all" || areaFilter !== "all" || actionFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setUserFilter("all");
    setAreaFilter("all");
    setActionFilter("all");
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}><Activity size={14} /> Operational audit trail</div>
          <h2>System Activity</h2>
          <p>Booking, maintenance, leave and access changes made across the system.</p>
        </div>
        <div className={styles.dayNavigation}>
          <button type="button" aria-label="Previous day" onClick={() => onDayChange(shiftDay(day, -1))}><ChevronLeft size={16} /></button>
          <label>
            <CalendarDays size={15} />
            <input aria-label="Activity day" type="date" value={day || ""} onChange={(event) => onDayChange(event.target.value)} />
          </label>
          <button type="button" aria-label="Next day" onClick={() => onDayChange(shiftDay(day, 1))}><ChevronRight size={16} /></button>
          <button type="button" className={styles.todayButton} onClick={() => onDayChange(ymd(new Date()))}>Today</button>
          <button type="button" className={styles.refreshButton} onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? styles.spinning : ""} /> Refresh</button>
        </div>
      </header>

      <div className={styles.filters}>
        <label className={styles.searchField}><Search size={15} /><input aria-label="Search system activity" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, action or details…" /></label>
        <select aria-label="Filter by user" value={userFilter} onChange={(event) => setUserFilter(event.target.value)}><option value="all">All users</option>{users.map((user) => <option key={user}>{user}</option>)}</select>
        <select aria-label="Filter by area" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">All areas</option>{areas.map((area) => <option key={area}>{area}</option>)}</select>
        <select aria-label="Filter by action" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">All actions</option>{actions.map((action) => <option key={action}>{action}</option>)}</select>
        {hasFilters && <button type="button" className={styles.clearButton} onClick={resetFilters}>Clear</button>}
        <span className={styles.showing}>{filtered.length} event{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className={styles.metrics}>
        <Metric icon={<Activity size={17} />} label="Events" value={filtered.length} hint="matching this view" />
        <Metric icon={<Users size={17} />} label="Active users" value={activeUsers} hint="people making changes" />
        <Metric icon={<Clock3 size={17} />} label="Busiest hour" value={busiest.value ? `${String(busiest.hour).padStart(2, "0")}:00` : "—"} hint={busiest.value ? `${busiest.value} events` : "no activity"} />
        <Metric icon={<CalendarDays size={17} />} label="Top area" value={topArea[0]} hint={topArea[1] ? `${topArea[1]} events` : "no activity"} />
      </div>

      <div className={styles.chartCard}>
        <div className={styles.chartHeader}><div><strong>Activity by hour</strong><span>When changes were made on {day}</span></div><div className={styles.legend}><i /> Events</div></div>
        <div className={styles.chart}>
          {hourly.map((item) => (
            <div className={styles.hour} key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00 — ${item.value} events`}>
              <div className={styles.barTrack}><div className={item.value ? styles.bar : styles.emptyBar} style={{ height: `${item.value ? Math.max(12, item.value / max * 100) : 4}%` }}>{item.value || ""}</div></div>
              <span>{String(item.hour).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Change</th><th>Area</th><th>Summary</th><th aria-label="Expand" /></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className={styles.empty}>Loading activity…</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No activity matches this view.</td></tr> : filtered.map((row) => {
              const open = expanded === row.id;
              return (
                <tr key={row.id} className={open ? styles.openRow : ""}>
                  <td><strong className={styles.time}>{row.at?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) || "—"}</strong></td>
                  <td><div className={styles.person}><span>{initials(row.user)}</span><div><strong>{String(row.user || "Unknown").split("@")[0]}</strong><small>{row.user || "Unknown user"}</small></div></div></td>
                  <td><span className={`${styles.action} ${actionTone(row.action)}`}>{row.action || "Activity"}</span></td>
                  <td><span className={styles.area}>{row.area || "Other"}</span></td>
                  <td><div className={open ? styles.fullDetails : styles.details}>{row.details || "No additional details"}</div></td>
                  <td><button type="button" className={styles.expandButton} aria-label={open ? "Collapse details" : "Expand details"} onClick={() => setExpanded(open ? "" : row.id)}><ChevronDown size={16} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, hint }) {
  return <div className={styles.metric}><span className={styles.metricIcon}>{icon}</span><div><small>{label}</small><strong>{value}</strong><span>{hint}</span></div></div>;
}
