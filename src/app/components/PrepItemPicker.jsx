"use client";

import { useMemo, useState } from "react";

const PRESET_PREP_ITEMS = [
  { text: "Check clean & tidy inside & out.", isEquipment: false },
  { text: "Check work area is clean & tidy.", isEquipment: false },
  { text: "Check screen wash & levels.", isEquipment: false },
  { text: "Check generator oil & water.", isEquipment: false },
  { text: "Check platforms are fitted.", isEquipment: true },
  { text: "Load spare wheel.", isEquipment: true },
  { text: "Check pyramid is fitted.", isEquipment: true },
  { text: "Tidy-up.", isEquipment: false },
  { text: "Check clean & tidy.", isEquipment: false },
  { text: "Check charged & on-charge.", isEquipment: true },
  { text: "Check oil & water on explorer.", isEquipment: false },
  { text: "Check trailer tyre pressures.", isEquipment: true },
  { text: "Check oil, water & screen wash.", isEquipment: false },
  { text: "Check generator & fuel can are loaded.", isEquipment: true },
];

export default function PrepItemPicker({ onQuickAdd, onCustomAdd }) {
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customText, setCustomText] = useState("");

  const canAddPreset = useMemo(() => !!selectedPreset, [selectedPreset]);
  const canAddCustom = useMemo(() => !!customText.trim(), [customText]);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#f8fafc",
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>Quick Add Prep Item</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
          style={{
            flex: 1,
            minWidth: 260,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            background: "#fff",
          }}
        >
          <option value="">Select preset item...</option>
          {PRESET_PREP_ITEMS.map((it) => (
            <option key={it.text} value={it.text}>
              {it.text}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            const item = PRESET_PREP_ITEMS.find((x) => x.text === selectedPreset);
            if (!item) return;
            onQuickAdd?.(item);
            setSelectedPreset("");
          }}
          disabled={!canAddPreset}
          style={{
            border: "1px solid #1d4ed8",
            background: canAddPreset ? "#1d4ed8" : "#93c5fd",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 800,
            cursor: canAddPreset ? "pointer" : "not-allowed",
          }}
        >
          Add Preset
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const t = customText.trim();
              if (!t) return;
              onCustomAdd?.(t);
              setCustomText("");
            }
          }}
          placeholder="Other custom prep item..."
          style={{
            flex: 1,
            minWidth: 240,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            background: "#fff",
          }}
        />

        <button
          type="button"
          onClick={() => {
            const t = customText.trim();
            if (!t) return;
            onCustomAdd?.(t);
            setCustomText("");
          }}
          disabled={!canAddCustom}
          style={{
            border: "1px solid #0f766e",
            background: canAddCustom ? "#0f766e" : "#99f6e4",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 800,
            cursor: canAddCustom ? "pointer" : "not-allowed",
          }}
        >
          Add Other
        </button>
      </div>
    </div>
  );
}

