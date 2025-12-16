// src/app/api/dvla/vehicle/route.js
import axios from "axios";

const DVLA_API_KEY = process.env.DVLA_API_KEY;
const DVLA_VES_URL =
  process.env.DVLA_VES_URL ||
  "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";

// GET /api/dvla/vehicle?vrm=AB12CDE
export async function GET(request) {
  try {
    // Debug: check env is loaded (safe – only shows first few chars)
    console.log(
      "DVLA key present?",
      !!DVLA_API_KEY,
      DVLA_API_KEY ? DVLA_API_KEY.slice(0, 4) + "..." : "no-key"
    );

    if (!DVLA_API_KEY) {
      return Response.json(
        { error: "DVLA_API_KEY not set on server" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const vrm = searchParams.get("vrm");

    if (!vrm) {
      return Response.json(
        { error: "Missing vrm query parameter" },
        { status: 400 }
      );
    }

    const formattedVrm = vrm.replace(/\s+/g, "").toUpperCase();

    const dvlaRes = await axios.post(
      DVLA_VES_URL,
      { registrationNumber: formattedVrm },
      {
        headers: {
          "x-api-key": DVLA_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const d = dvlaRes.data;

    const payload = {
      vrm: formattedVrm,
      make: d.make,
      model: d.model,
      colour: d.colour,
      fuelType: d.fuelType,
      bodyType: d.bodyType,
      engineCapacity: d.engineCapacity,
      motStatus: d.motStatus,
      motExpiryDate: d.motExpiryDate,
      taxStatus: d.taxStatus,
      taxDueDate: d.taxDueDate,
      raw: d, // keep full response in case you need more fields later
    };

    return Response.json(payload, { status: 200 });
  } catch (err) {
    console.error(
      "DVLA lookup error:",
      err.response?.status,
      err.response?.data || err.message
    );

    if (err.response) {
      return Response.json(
        {
          error: "DVLA API error",
          details: err.response.data,
        },
        { status: err.response.status }
      );
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
