import test from "node:test";
import assert from "node:assert/strict";

import { mergeQuoteTemplatesWithDefaults } from "../src/app/utils/quoteTemplateDefaults.js";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES } from "../src/app/utils/quoteTemplates.js";

const sourceTemplates = [
  {
    id: "vehicle-a",
    file: "Vehicle A.xlsx",
    serviceDescription: "Vehicle A",
    lineItems: [
      {
        section: "Travel Charges",
        description: "Travel Meal Allowance per man per day",
        qty: "",
        unitPrice: "22.00",
        totalMode: "auto",
        sourceRow: 40,
      },
      {
        section: "Travel Charges",
        description: "Hotel Per Man Per Room",
        qty: "",
        unitPrice: "TBC",
        totalMode: "production",
        sourceRow: 41,
      },
    ],
  },
  { id: "new-source-template", file: "New.xlsx", serviceDescription: "New", lineItems: [] },
];

test("source rows are restored while saved rates and manual lines are preserved", () => {
  const savedTemplates = [
    {
      id: "vehicle-a",
      file: "Vehicle A.xlsx",
      serviceDescription: "Vehicle A custom name",
      lineItems: [
        {
          section: "Travel Charges",
          description: "Travel Meal Allowance per man per day",
          qty: "",
          unitPrice: "24.00",
          totalMode: "tbc",
          sourceRow: 40,
        },
        {
          section: "Manual additions",
          description: "Customer-specific charge",
          qty: "",
          unitPrice: "50.00",
          totalMode: "auto",
        },
      ],
    },
  ];

  const merged = mergeQuoteTemplatesWithDefaults(savedTemplates, sourceTemplates);
  const vehicle = merged.find((template) => template.id === "vehicle-a");

  assert.equal(merged.length, 2);
  assert.equal(vehicle.serviceDescription, "Vehicle A custom name");
  assert.equal(vehicle.lineItems[0].unitPrice, "24.00");
  assert.equal(vehicle.lineItems[0].totalMode, "auto");
  assert.equal(vehicle.lineItems[1].description, "Hotel Per Man Per Room");
  assert.equal(vehicle.lineItems[2].description, "Customer-specific charge");
});

test("custom shared-rate calculation modes remain intentional", () => {
  const savedTemplates = [
    {
      id: "vehicle-a",
      lineItems: [
        {
          section: "Travel Charges",
          description: "Travel Meal Allowance per man per day",
          unitPrice: "30.00",
          totalMode: "tbc",
          sourceRow: 40,
          isCustomPrice: true,
          lockedSharedRate: true,
        },
      ],
    },
  ];

  const vehicle = mergeQuoteTemplatesWithDefaults(savedTemplates, sourceTemplates)[0];
  assert.equal(vehicle.lineItems[0].unitPrice, "30.00");
  assert.equal(vehicle.lineItems[0].totalMode, "tbc");
});

test("the legacy mini-low-loader mismatch is replaced by the current tow-pole source", () => {
  const id = "q-trojan-electric-and-motorcycle-banking-rig-or-mini-low-loader-2026";
  const source = [
    {
      id,
      file: "Q Trojan Electric and Motorcycle Banking Rig or Mini Low Loader 2026.xlsx",
      serviceDescription: "Trojan Electric With Straight Tow-Pole",
      lineItems: [
        {
          section: "Equipment - Daily Rates",
          description: "Straight Tow-Pole Towing Rig",
          unitPrice: "175.00",
          totalMode: "auto",
          sourceRow: 14,
        },
      ],
    },
  ];
  const saved = [
    {
      id,
      serviceDescription: "Trojan Electric With Mini Low-Loader",
      lineItems: [
        {
          section: "Equipment - Daily Rates",
          description: "Motorcycle Mini Low-Loader",
          unitPrice: "225.00",
          totalMode: "auto",
          sourceRow: 14,
        },
      ],
    },
  ];

  const merged = mergeQuoteTemplatesWithDefaults(saved, source)[0];
  assert.equal(merged.serviceDescription, "Trojan Electric With Straight Tow-Pole");
  assert.deepEqual(merged.lineItems.map((item) => item.description), ["Straight Tow-Pole Towing Rig"]);
});

test("saved templates that are not source templates remain available", () => {
  const saved = [{ id: "bespoke", serviceDescription: "Bespoke", lineItems: [] }];
  const merged = mergeQuoteTemplatesWithDefaults(saved, sourceTemplates);
  assert.equal(merged.at(-1).id, "bespoke");
});

test("generated defaults include the complete current workbook set and required travel rows", () => {
  assert.equal(FULL_SIZE_TRACKING_QUOTE_TEMPLATES.length, 54);
  assert.equal(new Set(FULL_SIZE_TRACKING_QUOTE_TEMPLATES.map((template) => template.id)).size, 54);

  for (const id of [
    "jwm-low-loader-working-in-dublin-area-2026",
    "q-globetrotter-elite-2026",
    "q-heavy-duty-spec-lift-elite-2026",
  ]) {
    assert.ok(FULL_SIZE_TRACKING_QUOTE_TEMPLATES.some((template) => template.id === id), id);
  }

  FULL_SIZE_TRACKING_QUOTE_TEMPLATES.forEach((template) => {
    const descriptions = new Set(template.lineItems.map((item) => item.description));
    assert.ok(descriptions.has("Travel Meal Allowance per man per day"), template.id);
    assert.ok(
      [...descriptions].some((description) => /^Hotel Per Man/i.test(description)),
      template.id
    );
  });
});

test("the current Trojan source is the two-sledge tow-pole setup", () => {
  const template = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.find(
    (item) => item.id === "q-trojan-electric-and-motorcycle-banking-rig-or-mini-low-loader-2026"
  );
  const descriptions = template.lineItems.map((item) => item.description).join(" ");

  assert.match(template.serviceDescription, /Tow-Pole/i);
  assert.match(descriptions, /Tow-Pole Towing Rig/i);
  assert.doesNotMatch(descriptions, /Motorcycle Mini Low-Loader/i);
});
