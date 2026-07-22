import axios from "axios";
import { requireActiveUserFromRequest } from "@/app/api/admin/_lib";

const MOT_HISTORY_BASE_URL =
  process.env.DVSA_MOT_HISTORY_BASE_URL || "https://history.mot.api.gov.uk";
const MOT_HISTORY_TOKEN_URL = process.env.DVSA_MOT_HISTORY_TOKEN_URL;
const MOT_HISTORY_SCOPE =
  process.env.DVSA_MOT_HISTORY_SCOPE || "https://tapi.dvsa.gov.uk/.default";
const MOT_HISTORY_CLIENT_ID = process.env.DVSA_MOT_HISTORY_CLIENT_ID;
const MOT_HISTORY_CLIENT_SECRET = process.env.DVSA_MOT_HISTORY_CLIENT_SECRET;
const MOT_HISTORY_API_KEY = process.env.DVSA_MOT_HISTORY_API_KEY;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const cleanRegistration = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

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

// GET /api/dvla/mot-history?vrm=AB12CDE
export async function GET(request) {
  try {
    const access = await requireActiveUserFromRequest(request, {
      workspaces: ["user", "service"],
    });
    if (access.error) return access.error;
    const { searchParams } = new URL(request.url);
    const vrm = cleanRegistration(searchParams.get("vrm"));

    if (!vrm) {
      return Response.json({ error: "Missing vrm query parameter" }, { status: 400 });
    }

    const token = await getAccessToken();
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
    const latestPassedMot = getLatestPassedMot(motTests);

    return Response.json(
      {
        vrm,
        registration: vehicle?.registration || vrm,
        make: vehicle?.make || "",
        model: vehicle?.model || "",
        fuelType: vehicle?.fuelType || "",
        primaryColour: vehicle?.primaryColour || "",
        registrationDate: vehicle?.registrationDate || "",
        manufactureDate: vehicle?.manufactureDate || "",
        engineSize: vehicle?.engineSize || "",
        hasOutstandingRecall: vehicle?.hasOutstandingRecall || "",
        nextMOT: latestPassedMot?.expiryDate || vehicle?.motTestDueDate || "",
        latestMot: latestPassedMot,
        motTests,
        raw: vehicle,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("MOT History lookup error:", err.response?.status, err.message);

    const status = err.status || err.response?.status || 500;
    const upstreamError = err.response?.data;

    return Response.json(
      {
        error: status === 500 ? "Internal server error" : "MOT History API error",
        details: upstreamError?.errorMessage || upstreamError?.message || err.message,
        code: upstreamError?.errorCode,
      },
      { status }
    );
  }
}
