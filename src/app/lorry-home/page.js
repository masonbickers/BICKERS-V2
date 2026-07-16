"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const getOdometerValue = (vehicle) => {
  const candidates = [vehicle?.odometer, vehicle?.serviceOdometer, vehicle?.mileage];
  for (const candidate of candidates) {
    const numeric = Number(String(candidate ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};

export default function LorryDashboardPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [lorries, setLorries] = useState([]);
  const [filter, setFilter] = useState("none");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "lorries", operation: "load lorries" });
      setLorries([]);
      return;
    }

    const fetchLorries = async () => {
      const snapshot = await getDocs(tenantCollectionQuery(db, "lorries", dataAccessState));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLorries(data);
    };

    fetchLorries();
  }, [accessKey, dataAccessState]);

  const applyFilter = (list) => {
    switch (filter) {
      case "mot":
        return [...list].sort((a, b) => new Date(a.motDue) - new Date(b.motDue));
      case "service":
        return [...list].sort((a, b) => new Date(a.nextService) - new Date(b.nextService));
      case "mileage":
        return [...list].sort((a, b) => getOdometerValue(b) - getOdometerValue(a));
      case "az":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  };

  const filteredLorries = applyFilter(lorries);

  return (
    <div className={layoutStyles.extracted1}>
      {/* Sidebar */}


      {/* Main */}
      <main className={layoutStyles.extracted2}>
        <button
          onClick={() => router.back()}
          className={layoutStyles.extracted3}
        >
          ← Back
        </button>

        <h1 className={layoutStyles.extracted4}>Lorry Overview</h1>

        <div className={layoutStyles.extracted5}>
          <label className={layoutStyles.extracted6}>Filter:</label>
          <select onChange={(e) => setFilter(e.target.value)} className={layoutStyles.extracted7}>
            <option value="none">None</option>
            <option value="mot">MOT Due Soon</option>
            <option value="service">Service Due</option>
            <option value="mileage">Mileage High to Low</option>
            <option value="az">A-Z by Name</option>
          </select>
        </div>

        <table className={layoutStyles.extracted8}>
          <thead className={layoutStyles.extracted9}>
            <tr>
              <th className={layoutStyles.extracted10}>Name</th>
              <th className={layoutStyles.extracted11}>Type</th>
              <th className={layoutStyles.extracted12}>Reg</th>
              <th className={layoutStyles.extracted13}>Mileage</th>
              <th className={layoutStyles.extracted14}>Last Service</th>
              <th className={layoutStyles.extracted15}>Next Service</th>
              <th className={layoutStyles.extracted16}>MOT Due</th>
              <th className={layoutStyles.extracted17}>Tacho Cal Due</th>
              <th className={layoutStyles.extracted18}>Driver</th>
              <th className={layoutStyles.extracted19}>Notes</th>
              <th className={layoutStyles.extracted20}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLorries.map(lorry => (
              <tr key={lorry.id} className={layoutStyles.extracted21}>
                <td className={layoutStyles.extracted22}>{lorry.name}</td>
                <td className={layoutStyles.extracted23}>{lorry.type}</td>
                <td className={layoutStyles.extracted24}>{lorry.registration}</td>
                <td className={layoutStyles.extracted25}>{getOdometerValue(lorry).toLocaleString()} mi</td>
                <td className={layoutStyles.extracted26}>{lorry.lastService}</td>
                <td className={layoutStyles.extracted27}>{lorry.nextService}</td>
                <td className={layoutStyles.extracted28}>{lorry.motDue}</td>
                <td className={layoutStyles.extracted29}>{lorry.tachoCalDue}</td>
                <td className={layoutStyles.extracted30}>{lorry.assignedDriver}</td>
                <td className={layoutStyles.extracted31}>{lorry.notes}</td>
                <td className={layoutStyles.extracted32}>
                  <button className={layoutStyles.extracted33} onClick={() => router.push(`/lorry-info/${lorry.id}`)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={layoutStyles.extracted34}>
          <button className={layoutStyles.extracted35} onClick={() => router.push("/add-lorry")}>+ Add Lorry</button>
        </div>
      </main>
    </div>
  );
}

// Styles
const navButton = {
  background: "transparent",
  color: "var(--color-white)",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid var(--color-text)",
};

const inputStyle = {
  padding: "8px 12px",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "4px",
};

const thStyle = {
  padding: 12,
  textAlign: "left",
  fontWeight: "bold",
};

const tdStyle = {
  padding: 12,
  textAlign: "left",
};

const addButton = {
  padding: "10px 20px",
  backgroundColor: "var(--color-info)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const editButton = {
  padding: "6px 12px",
  backgroundColor: "var(--color-success-accent)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
