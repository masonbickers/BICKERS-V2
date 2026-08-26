import test from "node:test";
import assert from "node:assert/strict";

import {
  STANDARD_TRAVEL_CHARGES,
  mergeQuoteTemplatesWithDefaults,
  sanitizeQuoteTemplateData,
} from "../src/app/utils/quoteTemplateDefaults.js";
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

test("source rows are restored while official shared rates and manual lines are preserved", () => {
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
  assert.equal(vehicle.lineItems[0].unitPrice, "22.00");
  assert.equal(vehicle.lineItems[0].totalMode, "tbc");
  assert.equal(vehicle.lineItems[1].description, "Hotel Per Man Per Room");
  assert.ok(vehicle.lineItems.some((item) => item.description === "Customer-specific charge"));
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
  assert.ok(merged.lineItems.some((item) => item.description === "Straight Tow-Pole Towing Rig"));
  assert.ok(!merged.lineItems.some((item) => item.description === "Motorcycle Mini Low-Loader"));
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

test("every loaded template receives the standard travel baseline without losing custom rows", () => {
  const templates = mergeQuoteTemplatesWithDefaults([], FULL_SIZE_TRACKING_QUOTE_TEMPLATES);

  templates.forEach((template) => {
    const travelDescriptions = template.lineItems
      .filter((item) => String(item.section || "").toLowerCase() === "travel charges")
      .map((item) => String(item.description || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());

    STANDARD_TRAVEL_CHARGES.forEach((charge) => {
      assert.ok(travelDescriptions.some(charge.matches), `${template.id}: ${charge.description}`);
    });
  });

  const horseRig = templates.find((template) => template.id === "horse-rig-2026");
  assert.ok(horseRig.lineItems.some((item) => item.description === "Ferry & GMR"));

  const heavyDuty = templates.find((template) => template.id === "q-heavy-duty-spec-lift-elite-2026");
  assert.ok(heavyDuty.lineItems.some((item) => item.description === "Support Vehicle"));
  assert.ok(heavyDuty.lineItems.some((item) => item.description === "Support Vehicle Mileage"));
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

test("the Can-Am labour description is complete and replaces the saved truncated row", () => {
  const source = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.filter(
    (template) => template.id === "q-can-am-maverick-2026"
  );
  const saved = [{
    id: "q-can-am-maverick-2026",
    lineItems: [{
      section: "Labour Rates - Daily Rates",
      description: "To Services of Driver/Technician per",
      qty: "1",
      unitPrice: "585.00",
      totalMode: "auto",
      sourceRow: 21,
    }],
  }];
  const merged = mergeQuoteTemplatesWithDefaults(saved, source)[0];
  const driverRows = merged.lineItems.filter((item) => /services of driver\/technician/i.test(item.description));

  assert.equal(driverRows.length, 1);
  assert.equal(driverRows[0].description, "To Services of Driver/Technician per 10hr Cont. Day (call to Wrap)");
});

test("the Electric Bicycle template includes the Commercials APA labour rule", () => {
  const template = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.find(
    (item) => item.id === "q-electric-bicycle-2026"
  );
  assert.ok(template.lineItems.some((item) => /Commercials .* APA/i.test(item.description)));
});

test("the higher GLC day rate stays outside the standard Driver Technician shared rate", () => {
  const source = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.filter(
    (template) => template.id === "q-glc-dynamic-tracking-vehicle-non-circuit-work-2026"
  );
  const saved = [{
    id: "q-glc-dynamic-tracking-vehicle-non-circuit-work-2026",
    lineItems: [{
      section: "Labour Rates - Daily Rates",
      description: "To Services of Driver/Technician per 9hr day (10hrs Inc. 1hr lunch)",
      qty: "",
      unitPrice: "680.00",
      totalMode: "auto",
      sourceRow: 19,
    }],
  }];
  const merged = mergeQuoteTemplatesWithDefaults(saved, source)[0];
  const glcRows = merged.lineItems.filter((item) => /GLC Driver\/Technician/i.test(item.description));

  assert.equal(glcRows.length, 1);
  assert.equal(glcRows[0].unitPrice, "680.00");
  assert.doesNotMatch(glcRows[0].description, /services? of driver.*technician.*10hr/i);
});

test("the higher GLC travel-time rate stays outside the standard shared travel-time wording", () => {
  const source = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.filter(
    (template) => template.id === "q-glc-dynamic-tracking-vehicle-non-circuit-work-2026"
  );
  const saved = [{
    id: "q-glc-dynamic-tracking-vehicle-non-circuit-work-2026",
    lineItems: [{
      section: "Travel Charges",
      description: "Tracking Vehicle and Crew Travel Time",
      qty: "",
      unitPrice: "68.00",
      totalMode: "auto",
      sourceRow: 31,
    }],
  }];
  const merged = mergeQuoteTemplatesWithDefaults(saved, source)[0];
  const glcRows = merged.lineItems.filter((item) => /GLC Crew & Vehicle Travel Time/i.test(item.description));

  assert.equal(glcRows.length, 1);
  assert.equal(glcRows[0].unitPrice, "68.00");
  assert.equal(glcRows[0].isCustomPrice, true);
  assert.equal(glcRows[0].usesSharedRate, false);
  assert.doesNotMatch(glcRows[0].description, /tracking vehicle and crew travel time/i);
});

test("confirmed official travel prices replace unlocked legacy values", () => {
  const source = [{
    id: "legacy-travel-rates",
    lineItems: [
      { section: "Travel Charges", description: "Travel Meal Allowance per man per day", unitPrice: "18.00", totalMode: "tbc", sourceRow: 1 },
      { section: "Travel Charges", description: "Breakfast/Lunch not Supplied on location per man", unitPrice: "18.00", totalMode: "tbc", sourceRow: 2 },
      { section: "Travel Charges", description: "Overnights", unitPrice: "28.00", totalMode: "tbc", sourceRow: 3 },
      { section: "Travel Charges", description: "Recce Mileage", unitPrice: "0.66", totalMode: "auto", sourceRow: 4 },
      { section: "Travel Charges", description: "London Congestion Charge-ULEZ per vehicle", unitPrice: "130.00", totalMode: "tbc", sourceRow: 5 },
      { section: "Travel Charges", description: "Hotel Per Man Per Room", unitPrice: "", totalMode: "production", sourceRow: 6 },
    ],
  }];
  const template = mergeQuoteTemplatesWithDefaults([], source)[0];
  const prices = Object.fromEntries(template.lineItems.map((item) => [item.description, item.unitPrice]));

  assert.equal(prices["Travel Meal Allowance per man per day"], "22.00");
  assert.equal(prices["Breakfast/Lunch not Supplied on location per man"], "22.00");
  assert.equal(prices.Overnights, "35.00");
  assert.equal(prices["Recce Mileage"], "0.68");
  assert.equal(prices["London Congestion Charge-ULEZ per vehicle"], "30.00");
  assert.equal(prices["Hotel Per Man Per Room"], "TBC");
});

test("standard travel calculation modes are consistent", () => {
  const templates = mergeQuoteTemplatesWithDefaults([], FULL_SIZE_TRACKING_QUOTE_TEMPLATES);
  const standardTravelLines = templates.flatMap((template) =>
    template.lineItems.filter((item) => item.standardTravelCharge || /tracking vehicle and crew travel|travel meal|hotel per (man|person)|overnight|breakfast lunch|recce travel|recce mileage|fixed travel charge|congestion|clean air zone/i.test(item.description))
  ).filter((item) => !item.isCustomPrice && !/hotel & overnight|recce travel day \(when recce/i.test(item.description));

  for (const item of standardTravelLines) {
    if (/hotel per (man|person)/i.test(item.description)) assert.equal(item.totalMode, "production", item.description);
    else if (/recce mileage/i.test(item.description)) assert.equal(item.totalMode, "auto", item.description);
    else assert.equal(item.totalMode, "tbc", item.description);
  }
});

test("quote-template storage removes nested undefined fields without losing intentional empty values", () => {
  const input = [{
    id: "template-a",
    optional: undefined,
    lineItems: [{
      description: "Travel time",
      unitPrice: "",
      usesSharedRate: false,
      sourceRow: undefined,
    }, undefined],
  }];

  assert.deepEqual(sanitizeQuoteTemplateData(input), [{
    id: "template-a",
    lineItems: [{
      description: "Travel time",
      unitPrice: "",
      usesSharedRate: false,
    }],
  }]);
  assert.equal(Object.hasOwn(input[0], "optional"), true);
});
