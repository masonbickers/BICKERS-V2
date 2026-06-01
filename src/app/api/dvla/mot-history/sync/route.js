import axios from "axios";
import { collection, doc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../../../../../firebaseConfig";
import { adminReadDocument } from "../../../_firebaseAdminRest";

const MOT_HISTORY_BASE_URL =
  process.env.DVSA_MOT_HISTORY_BASE_URL || "https://history.mot.api.gov.uk";
const MOT_HISTORY_TOKEN_URL = process.env.DVSA_MOT_HISTORY_TOKEN_URL;
const MOT_HISTORY_SCOPE =
  process.env.DVSA_MOT_HISTORY_SCOPE || "https://tapi.dvsa.gov.uk/.default";
const MOT_HISTORY_CLIENT_ID = process.env.DVSA_MOT_HISTORY_CLIENT_ID;
const MOT_HISTORY_CLIENT_SECRET = process.env.DVSA_MOT_HISTORY_CLIENT_SECRET;
const MOT_HISTORY_API_KEY = process.env.DVSA_MOT_HISTORY_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "AIzaSyBiKz88kMEAB5C-oRn3qN6E7KooDcmYTWE";
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bickers-booking";
const ADMIN_EMAILS = new Set(["mason@bickers.co.uk", "paul@bickers.co.uk", "adam@bickers.co.uk"]);

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const cleanRegistration = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();
const norm = (value) => String(value || "").trim().toLowerCase();
const dateOnly = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
};

const parseDateTime = (value) => {
  if (!value) return 0;
  const normalised = String(value).replace(" ", "T");
  const time = new Date(normalised).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortMotTestsNewestFirst = (tests) =>
  Array.isArray(tests)
    ? [...tests].sort((a, b) => parseDateTime(b.completedDate) - parseDateTime(a.completedDate))
    : [];

const getLatestPassedMot = (tests) =>
  sortMotTestsNewestFirst(tests).find(
    (test) => String(test?.testResult || "").toUpperCase() === "PASSED"
  ) || null;

const getLatestMotTest = (tests) => (Array.isArray(tests) ? tests[0] : null) || null;

const formatDefectText = (defect) =>
  String(defect?.text || defect?.description || defect?.defectText || defect?.itemDescription || "").trim();

const getMotDefects = (test) =>
  Array.isArray(test?.defects)
    ? test.defects.filter((defect) => formatDefectText(defect))
    : [];

const normaliseMotTestForStorage = (test) => ({
  completedDate: test?.completedDate || "",
  expiryDate: test?.expiryDate || "",
  testResult: test?.testResult || "",
  motTestNumber: test?.motTestNumber || "",
  odometerValue: test?.odometerValue || "",
  odometerUnit: test?.odometerUnit || "",
  odometerResultType: test?.odometerResultType || "",
  dataSource: test?.dataSource || "",
  defects: getMotDefects(test).map((defect) => ({
    text: formatDefectText(defect),
    type: defect?.type || "",
    dangerous: Boolean(defect?.dangerous),
  })),
});

const formatOdometer = (test) => {
  if (!test?.odometerValue) return "";
  const value = Number(String(test.odometerValue).replace(/[^\d.]/g, ""));
  const displayValue = Number.isFinite(value) && value > 0 ? value.toLocaleString("en-GB") : test.odometerValue;
  return `${displayValue}${test.odometerUnit ? ` ${String(test.odometerUnit).toLowerCase()}` : ""}`;
};

const getMileageAnomaly = (tests) => {
  const latest = Number(String(tests[0]?.odometerValue || "").replace(/[^\d.]/g, ""));
  const previous = Number(String(tests[1]?.odometerValue || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || latest <= 0 || previous <= 0) return "";
  return latest < previous
    ? `Mileage lower than previous MOT (${latest.toLocaleString("en-GB")} vs ${previous.toLocaleString("en-GB")}).`
    : "";
};

const isRetentionPlate = (vehicle = {}) =>
  norm(vehicle.category) === "number plates on retention" ||
  vehicle.recordType === "numberPlateRetention";

const isVehicleWorthSyncing = (vehicle = {}) =>
  !isRetentionPlate(vehicle) &&
  cleanRegistration(vehicle.registration || vehicle.reg || vehicle.registrationNumber);

const getExistingOdometer = (vehicle = {}) => {
  const raw = String(vehicle.odometer ?? vehicle.serviceOdometer ?? vehicle.mileage ?? "").trim();
  const numeric = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const missing = [];
  if (!MOT_HISTORY_TOKEN_URL) missing.push("DVSA_MOT_HISTORY_TOKEN_URL");
  if (!MOT_HISTORY_CLIENT_ID) missing.push("DVSA_MOT_HISTORY_CLIENT_ID");
  if (!MOT_HISTORY_CLIENT_SECRET) missing.push("DVSA_MOT_HISTORY_CLIENT_SECRET");
  if (!MOT_HISTORY_API_KEY) missing.push("DVSA_MOT_HISTORY_API_KEY");
  if (missing.length) {
    const error = new Error(`Missing MOT History env vars: ${missing.join(", ")}`);
    error.status = 500;
    throw error;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: MOT_HISTORY_CLIENT_ID,
    client_secret: MOT_HISTORY_CLIENT_SECRET,
    scope: MOT_HISTORY_SCOPE,
  });

  const tokenRes = await axios.post(MOT_HISTORY_TOKEN_URL, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const accessToken = tokenRes.data?.access_token;
  const expiresInSeconds = Number(tokenRes.data?.expires_in || 0);
  if (!accessToken) {
    const error = new Error("MOT History token response did not include an access token");
    error.status = 502;
    throw error;
  }

  cachedToken = accessToken;
  cachedTokenExpiresAt = Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000;
  return cachedToken;
}

async function fetchMotHistory(vrm, token) {
  const motRes = await axios.get(
    `${MOT_HISTORY_BASE_URL}/v1/trade/vehicles/registration/${encodeURIComponent(vrm)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-API-Key": MOT_HISTORY_API_KEY,
        Accept: "application/json",
      },
    }
  );

  const vehicle = Array.isArray(motRes.data) ? motRes.data[0] : motRes.data;
  const motTests = sortMotTestsNewestFirst(vehicle?.motTests);
  const storedMotTests = motTests.map(normaliseMotTestForStorage);
  const latestMot = getLatestMotTest(storedMotTests);
  const latestPassedMot = getLatestPassedMot(motTests);

  return {
    latestMot,
    latestPassedMot,
    storedMotTests,
    nextMOT: dateOnly(latestPassedMot?.expiryDate || vehicle?.motTestDueDate || ""),
    lastMOT: dateOnly(latestPassedMot?.completedDate || ""),
    make: vehicle?.make || "",
    model: vehicle?.model || "",
    vehicleDetails: {
      registration: vehicle?.registration || vrm,
      make: vehicle?.make || "",
      model: vehicle?.model || "",
      fuelType: vehicle?.fuelType || "",
      primaryColour: vehicle?.primaryColour || "",
      registrationDate: vehicle?.registrationDate || "",
      manufactureDate: vehicle?.manufactureDate || "",
      engineSize: vehicle?.engineSize || "",
      hasOutstandingRecall: vehicle?.hasOutstandingRecall || "",
    },
  };
}

async function verifyFirebaseIdTokenFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const user = Array.isArray(data?.users) ? data.users[0] : null;
  if (!user?.localId) return null;

  return {
    uid: user.localId,
    email: String(user.email || "").trim().toLowerCase(),
    idToken,
  };
}

async function isAdminUser(user) {
  if (!user?.email) return false;
  if (ADMIN_EMAILS.has(user.email)) return true;

  const employeeQueries = [
    query(collection(db, "employees"), where("uid", "==", user.uid), limit(1)),
    query(collection(db, "employees"), where("authUid", "==", user.uid), limit(1)),
    query(collection(db, "employees"), where("email", "==", user.email), limit(1)),
  ];

  for (const employeeQuery of employeeQueries) {
    const snap = await getDocs(employeeQuery);
    if (!snap.empty) {
      const role = String(snap.docs[0].data()?.role || "").trim().toLowerCase();
      if (role === "admin") return true;
    }
  }

  return false;
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValueToJs);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, firestoreValueToJs(child)])
    );
  }
  return null;
}

function firestoreDocToVehicle(docSnap) {
  const fields = docSnap?.fields || {};
  const data = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)])
  );
  return {
    ...data,
    id: String(docSnap?.name || "").split("/").pop(),
    __firestoreName: docSnap?.name || "",
  };
}

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, jsToFirestoreValue(child)])
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

async function listVehiclesWithUserToken(idToken) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/vehicles?pageSize=1000`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Could not read vehicles from Firestore.");
  }

  const data = await res.json();
  return (data.documents || []).map(firestoreDocToVehicle);
}

async function updateVehicleWithUserToken(vehicle, patch, idToken) {
  const fieldPaths = Object.keys(patch);
  if (!vehicle.__firestoreName || !fieldPaths.length) return;

  const updateMask = fieldPaths.map((fieldPath) => `updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`).join("&");
  const res = await fetch(`https://firestore.googleapis.com/v1/${vehicle.__firestoreName}?${updateMask}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, jsToFirestoreValue(value)])
      ),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Could not update vehicle in Firestore.");
  }
}

async function updateSyncMetadataWithUserToken(results, user, idToken) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/motHistorySync?updateMask.fieldPaths=lastAllFetchedAt&updateMask.fieldPaths=lastAllFetchStartedAt&updateMask.fieldPaths=lastAllFetchFinishedAt&updateMask.fieldPaths=lastAllFetchDurationMs&updateMask.fieldPaths=lastAllFetchedBy&updateMask.fieldPaths=lastAllFetchSource&updateMask.fieldPaths=lastAllFetchChecked&updateMask.fieldPaths=lastAllFetchUpdated&updateMask.fieldPaths=lastAllFetchUnchanged&updateMask.fieldPaths=lastAllFetchSkipped&updateMask.fieldPaths=lastAllFetchFailed&updateMask.fieldPaths=lastAllFetchFailures&updateMask.fieldPaths=lastAllFetchUpdatedVehicles`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          lastAllFetchedAt: jsToFirestoreValue(new Date().toISOString()),
          lastAllFetchStartedAt: jsToFirestoreValue(results.startedAt || ""),
          lastAllFetchFinishedAt: jsToFirestoreValue(results.finishedAt || ""),
          lastAllFetchDurationMs: jsToFirestoreValue(results.durationMs || 0),
          lastAllFetchedBy: jsToFirestoreValue(user.email || user.uid || ""),
          lastAllFetchSource: jsToFirestoreValue("manual"),
          lastAllFetchChecked: jsToFirestoreValue(results.checked || 0),
          lastAllFetchUpdated: jsToFirestoreValue(results.updated || 0),
          lastAllFetchUnchanged: jsToFirestoreValue(results.unchanged || 0),
          lastAllFetchSkipped: jsToFirestoreValue(results.skipped || 0),
          lastAllFetchFailed: jsToFirestoreValue(results.failed || 0),
          lastAllFetchFailures: jsToFirestoreValue((results.failures || []).slice(0, 50)),
          lastAllFetchUpdatedVehicles: jsToFirestoreValue((results.updatedVehicles || []).slice(0, 50)),
        },
      }),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Could not update MOT sync metadata.");
  }
}

function buildVehiclePatch(vehicle, motHistory) {
  const patch = {};
  const lastMOT = motHistory.lastMOT;
  const nextMOT = motHistory.nextMOT;
  const latestPassedMot = motHistory.latestPassedMot;

  if (lastMOT && dateOnly(vehicle.lastMOT || vehicle.lastMot) !== lastMOT) {
    patch.lastMOT = lastMOT;
    patch.lastMot = lastMOT;
  }

  if (nextMOT && dateOnly(vehicle.nextMOT || vehicle.nextMot || vehicle.nextMotDate) !== nextMOT) {
    patch.nextMOT = nextMOT;
    patch.nextMot = nextMOT;
    patch.nextMotDate = nextMOT;
    patch.motDueDate = nextMOT;
  }

  const motOdometer = Number(String(latestPassedMot?.odometerValue || "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(motOdometer) && motOdometer > 0 && motOdometer >= getExistingOdometer(vehicle)) {
    patch.odometer = motOdometer;
    patch.mileage = motOdometer;
    patch.serviceOdometer = motOdometer;
  }

  if (!String(vehicle.manufacturer || vehicle.make || "").trim() && motHistory.make) {
    patch.manufacturer = motHistory.make;
    patch.make = motHistory.make;
  }
  if (!String(vehicle.model || "").trim() && motHistory.model) patch.model = motHistory.model;

  if (Object.keys(patch).length) {
    patch.motHistorySyncedAt = new Date().toISOString();
    patch.motHistoryLatestTestNumber = latestPassedMot?.motTestNumber || "";
  }

  if (motHistory.storedMotTests?.length) {
    const latestMot = motHistory.latestMot || motHistory.storedMotTests[0];
    const latestDefects = getMotDefects(latestMot);
    patch.dvsaMotHistoryFetchedAt = new Date().toISOString();
    patch.dvsaMotTests = motHistory.storedMotTests;
    patch.dvsaLatestMot = latestMot;
    patch.dvsaLatestMotResult = latestMot?.testResult || "";
    patch.dvsaLatestMotTestNumber = latestMot?.motTestNumber || "";
    patch.dvsaLatestMotOdometer = formatOdometer(latestMot);
    patch.dvsaLatestMotDefectCount = latestDefects.length;
    patch.dvsaLatestMotAdvisoryCount = latestDefects.filter((defect) =>
      String(defect?.type || "").toUpperCase().includes("ADVISORY")
    ).length;
    patch.dvsaLatestMotDangerousCount = latestDefects.filter((defect) => defect?.dangerous).length;
    patch.dvsaLatestMotMajorCount = latestDefects.filter((defect) =>
      String(defect?.type || "").toUpperCase().includes("MAJOR")
    ).length;
    patch.dvsaMotMileageWarning = getMileageAnomaly(motHistory.storedMotTests);
    patch.dvsaMotVehicleDetails = motHistory.vehicleDetails || {};
  }

  return patch;
}

async function runMotHistorySync() {
  const snapshot = await getDocs(collection(db, "vehicles"));
  const vehicles = snapshot.docs.map((vehicleDoc) => ({
    id: vehicleDoc.id,
    ...(vehicleDoc.data() || {}),
  }));
  const token = await getAccessToken();

  const results = {
    checked: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const vehicle of vehicles) {
    const vrm = cleanRegistration(vehicle.registration || vehicle.reg || vehicle.registrationNumber);
    if (!isVehicleWorthSyncing(vehicle)) {
      results.skipped += 1;
      continue;
    }

    results.checked += 1;

    try {
      const motHistory = await fetchMotHistory(vrm, token);
      const patch = buildVehiclePatch(vehicle, motHistory);
      if (!Object.keys(patch).length) continue;

      await updateDoc(doc(db, "vehicles", vehicle.id), patch);
      results.updated += 1;
    } catch (err) {
      results.failed += 1;
      results.failures.push({
        vehicleId: vehicle.id,
        vrm,
        status: err.response?.status || null,
        message: err.response?.data?.message || err.message,
      });
    }
  }

  return results;
}

async function runMotHistorySyncWithUserToken(idToken) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const vehicles = await listVehiclesWithUserToken(idToken);
  const token = await getAccessToken();

  const results = {
    checked: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
    failures: [],
    updatedVehicles: [],
    startedAt,
    finishedAt: "",
    durationMs: 0,
  };

  for (const vehicle of vehicles) {
    const vrm = cleanRegistration(vehicle.registration || vehicle.reg || vehicle.registrationNumber);
    if (!isVehicleWorthSyncing(vehicle)) {
      results.skipped += 1;
      continue;
    }

    results.checked += 1;

    try {
      const motHistory = await fetchMotHistory(vrm, token);
      const patch = buildVehiclePatch(vehicle, motHistory);
      if (!Object.keys(patch).length) {
        results.unchanged += 1;
        continue;
      }

      await updateVehicleWithUserToken(vehicle, patch, idToken);
      results.updated += 1;
      results.updatedVehicles.push({
        vehicleId: vehicle.id,
        vrm,
        name: vehicle.name || "",
        nextMOT: patch.nextMOT || vehicle.nextMOT || "",
        lastMOT: patch.lastMOT || vehicle.lastMOT || "",
        odometer: patch.odometer || vehicle.odometer || "",
        testNumber: patch.motHistoryLatestTestNumber || "",
        changedFields: Object.keys(patch).filter((key) => !key.startsWith("motHistory")),
      });
    } catch (err) {
      results.failed += 1;
      results.failures.push({
        vehicleId: vehicle.id,
        vrm,
        status: err.response?.status || null,
        message: err.response?.data?.message || err.message,
      });
    }
  }

  results.finishedAt = new Date().toISOString();
  results.durationMs = Date.now() - startedAtMs;
  return results;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runMotHistorySync(), { status: 200 });
  } catch (err) {
    console.error("Weekly MOT History sync failed:", err.response?.status, err.message);
    return Response.json(
      {
        error: "Weekly MOT History sync failed",
        details: err.response?.data?.message || err.message,
      },
      { status: err.status || err.response?.status || 500 }
    );
  }
}

export async function POST(request) {
  const user = await verifyFirebaseIdTokenFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userData = await adminReadDocument("users", user.uid);
  if (userData?.isEnabled === false) {
    return Response.json({ error: "Account disabled" }, { status: 403 });
  }

  if (!(await isAdminUser(user))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runMotHistorySyncWithUserToken(user.idToken);
    await updateSyncMetadataWithUserToken(results, user, user.idToken);
    return Response.json({ ...results, triggeredBy: user.email }, { status: 200 });
  } catch (err) {
    console.error("Manual MOT History sync failed:", err.response?.status, err.message);
    return Response.json(
      {
        error: "Manual MOT History sync failed",
        details: err.response?.data?.message || err.message,
      },
      { status: err.status || err.response?.status || 500 }
    );
  }
}
