import {
  deriveBookingResourceLocks,
  buildResourceLockDocId,
  checkResourceLockConflicts,
} from "../src/app/utils/resourceLocks.js";

const toFlatLockDocs = (locks = []) => {
  const map = new Map();
  locks.forEach((lock) => {
    if (!lock || !lock.lockDocId) return;
    const existing = map.get(lock.lockDocId) || {
      resourceType: lock.resourceType,
      resourceId: lock.resourceId,
      date: lock.date,
      locks: [],
    };
    existing.locks.push(lock);
    map.set(lock.lockDocId, existing);
  });
  return Array.from(map.values());
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const buildDocIndex = (locks) => toFlatLockDocs(locks);

const testCases = [];
const addResult = (name, fn) => {
  testCases.push({ name, fn });
};

const booking = (overrides = {}) => ({
  quoteNumber: overrides.quoteNumber || "0000",
  production: overrides.production || "Booking",
  status: overrides.status || "First Pencil",
  startDate: overrides.startDate || "2026-07-06",
  endDate: overrides.endDate || "2026-07-06",
  date: overrides.date,
  vehicles: overrides.vehicles,
  equipment: overrides.equipment,
  employees: overrides.employees,
  employeesByDate: overrides.employeesByDate,
  vehicleStatus: overrides.vehicleStatus,
  id: overrides.id || overrides.quoteNumber || `bk-${Math.random().toString(36).slice(2, 8)}`,
});

const run = async () => {
  const failures = [];
  let passed = 0;

  addResult("1) Confirmed vs Confirmed (vehicle, same date) is blocked", () => {
    const left = booking({
      id: "b1",
      quoteNumber: "1001",
      production: "Faul",
      status: "Confirmed",
      vehicles: [{ id: "v1", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b2",
      quoteNumber: "1002",
      production: "Karma",
      status: "Confirmed",
      date: "2026-07-06",
      vehicles: [{ id: "v1", registration: "TWIZZY" }],
    });

    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected conflict for confirmed+confirmed");
    assert(conflict.vehicleConflicts.length === 1, "Expected one vehicle conflict");
  });

  addResult("2) Confirmed vs First Pencil (vehicle, same date) is blocked", () => {
    const left = booking({
      id: "b3",
      quoteNumber: "1003",
      production: "Faul",
      status: "Confirmed",
      vehicles: [{ id: "v2", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b4",
      quoteNumber: "1004",
      production: "Karma",
      status: "First Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v2", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected conflict for confirmed+first pencil");
    assert(conflict.vehicleConflicts.length === 1, "Expected one vehicle conflict");
  });

  addResult("3) Confirmed vs Second Pencil (vehicle, same date) is blocked", () => {
    const left = booking({
      id: "b5",
      quoteNumber: "1005",
      production: "Faul",
      status: "Confirmed",
      vehicles: [{ id: "v3", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b6",
      quoteNumber: "1006",
      production: "Karma",
      status: "Second Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v3", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected conflict for confirmed+second pencil");
    assert(conflict.vehicleConflicts.length === 1, "Expected one vehicle conflict");
  });

  addResult("4) First Pencil vs First Pencil (vehicle, same date) is blocked", () => {
    const left = booking({
      id: "b7",
      quoteNumber: "1007",
      production: "Faul",
      status: "First Pencil",
      vehicles: [{ id: "v4", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b8",
      quoteNumber: "1008",
      production: "Karma",
      status: "First Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v4", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected first pencil blocking conflict");
    assert(conflict.vehicleConflicts.length === 1, "Expected one vehicle conflict");
  });

  addResult("5) First Pencil vs Second Pencil (vehicle, same date) is allowed", () => {
    const left = booking({
      id: "b9",
      quoteNumber: "1009",
      production: "Faul",
      status: "First Pencil",
      vehicles: [{ id: "v5", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b10",
      quoteNumber: "1010",
      production: "Karma",
      status: "Second Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v5", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(!conflict.hasBlockingConflicts, "Expected no block for first+second");
    assert(conflict.vehicleConflicts.length === 0, "Expected no vehicle conflicts");
  });

  addResult("6) Second Pencil vs First Pencil (vehicle, same date) is allowed", () => {
    const left = booking({
      id: "b11",
      quoteNumber: "1011",
      production: "Faul",
      status: "First Pencil",
      vehicles: [{ id: "v6", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b12",
      quoteNumber: "1012",
      production: "Karma",
      status: "Second Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v6", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc, { reverse: true });
    assert(!conflict.hasBlockingConflicts, "Expected second pencil to be allowed behind first pencil");
    assert(conflict.vehicleConflicts.length === 0, "Expected no vehicle conflicts");
  });

  addResult("7) Second Pencil vs Second Pencil (vehicle, same date) is allowed", () => {
    const left = booking({
      id: "b13",
      quoteNumber: "1013",
      production: "Faul",
      status: "Second Pencil",
      vehicles: [{ id: "v7", registration: "TWIZZY" }],
    });
    const right = booking({
      id: "b14",
      quoteNumber: "1014",
      production: "Karma",
      status: "Second Pencil",
      date: "2026-07-06",
      vehicles: [{ id: "v7", registration: "TWIZZY" }],
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(!conflict.hasBlockingConflicts, "Expected second pencils to be allowed together");
    assert(conflict.vehicleConflicts.length === 0, "Expected no vehicle conflicts");
  });

  addResult("8) Crew same person same date is blocked", () => {
    const left = booking({
      id: "b15",
      quoteNumber: "1015",
      production: "Faul",
      status: "Confirmed",
      employees: [{ id: "c1", name: "Brian" }],
      date: "2026-07-07",
    });
    const right = booking({
      id: "b16",
      quoteNumber: "1016",
      production: "Karma",
      status: "Confirmed",
      employees: [{ id: "c1", name: "Brian" }],
      date: "2026-07-07",
    });
    const rightLocks = deriveBookingResourceLocks(right, { resourceTypes: ["crew"] }).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left, { resourceTypes: ["crew"] }).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected crew conflict for duplicate person");
    assert(conflict.crewConflicts.length === 1, "Expected one crew conflict");
  });

  addResult("9) Equipment same asset same date is blocked", () => {
    const left = booking({
      id: "b17",
      quoteNumber: "1017",
      production: "Faul",
      status: "Confirmed",
      equipment: [{ id: "e1", name: "Trailer A" }],
      date: "2026-07-08",
    });
    const right = booking({
      id: "b18",
      quoteNumber: "1018",
      production: "Karma",
      status: "Confirmed",
      equipment: [{ id: "e1", name: "Trailer A" }],
      date: "2026-07-08",
    });
    const rightLocks = deriveBookingResourceLocks(right, { resourceTypes: ["equipment"] }).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left, { resourceTypes: ["equipment"] }).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected equipment conflict for duplicate asset");
    assert(conflict.equipmentConflicts.length === 1, "Expected one equipment conflict");
  });

  addResult("10) same booking id is ignored during edit conflict checks", () => {
    const base = booking({
      id: "b19",
      quoteNumber: "1019",
      production: "Current",
      status: "First Pencil",
      vehicles: [{ id: "v8", registration: "TWIZZY" }],
      startDate: "2026-07-10",
      endDate: "2026-07-11",
    });
    const right = booking({
      ...base,
      production: "Current-Updated",
      startDate: "2026-07-10",
      endDate: "2026-07-11",
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(base).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc, { ignoreBookingId: "b19" });
    assert(!conflict.hasBlockingConflicts, "Expected same booking id to be ignored");
    assert(conflict.conflicts.length === 0, "Expected zero conflicts");
  });

  addResult("11) multi-day partial overlap only blocks overlapping dates", () => {
    const left = booking({
      id: "b20",
      quoteNumber: "1020",
      production: "Faul",
      status: "Confirmed",
      vehicles: [{ id: "v9", registration: "TWIZZY" }],
      startDate: "2026-07-10",
      endDate: "2026-07-11",
    });
    const right = booking({
      id: "b21",
      quoteNumber: "1021",
      production: "Karma",
      status: "Confirmed",
      date: "2026-07-11",
      endDate: "2026-07-12",
      vehicles: [{ id: "v9", registration: "TWIZZY" }],
      startDate: "2026-07-11",
    });
    const rightLocks = deriveBookingResourceLocks(right).locks;
    const leftDoc = buildDocIndex(deriveBookingResourceLocks(left).locks);
    const conflict = checkResourceLockConflicts(rightLocks, leftDoc);
    assert(conflict.hasBlockingConflicts, "Expected partial overlap conflict");
    assert(conflict.vehicleConflicts.length === 1, "Expected one overlapping conflict entry");
    assert(conflict.vehicleConflicts[0].date === "2026-07-11", "Expected conflict only on overlapping date");
  });

  addResult("12) inactive booking creates no locks", () => {
    const inactive = booking({
      id: "b22",
      quoteNumber: "1022",
      production: "Done",
      status: "Completed",
      vehicles: [{ id: "v10", registration: "TWIZZY" }],
      date: "2026-07-13",
    });
    const derived = deriveBookingResourceLocks(inactive);
    assert(derived.locks.length === 0, "Expected no locks for inactive booking");
    assert(derived.skipped?.reason === "inactive", "Expected skipped reason inactive");
  });

  for (const item of testCases) {
    try {
      item.fn();
      passed += 1;
      console.log(`pass: ${item.name}`);
    } catch (error) {
      failures.push(`${item.name} -> ${error.message}`);
      console.log(`fail: ${item.name}`);
      console.log(error.message);
    }
  }

  console.log(`\nresource lock helper tests: ${passed}/${testCases.length} passed`);
  if (failures.length) {
    console.log("Failures:");
    failures.forEach((line) => console.log(` - ${line}`));
    process.exitCode = 1;
  }
};

run();
