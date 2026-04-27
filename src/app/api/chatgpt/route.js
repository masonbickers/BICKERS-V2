"use server";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "AIzaSyBiKz88kMEAB5C-oRn3qN6E7KooDcmYTWE";

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

async function verifyFirebaseIdTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization") || "";
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
    email: String(user.email || "").toLowerCase(),
  };
}

function serializeDateish(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return value;
}

function normalizeRecord(record) {
  if (Array.isArray(record)) return record.map(normalizeRecord);
  if (!record || typeof record !== "object") return record;

  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value?.toDate === "function" || typeof value.seconds === "number") {
        out[key] = serializeDateish(value);
      } else {
        out[key] = normalizeRecord(value);
      }
    } else {
      out[key] = normalizeRecord(value);
    }
  }
  return out;
}

function safeString(value) {
  return String(value || "").trim();
}

function takeLatest(items, max = 50, dateFields = []) {
  const ranked = [...items].sort((a, b) => {
    const aValue = dateFields.map((field) => a?.[field]).find(Boolean);
    const bValue = dateFields.map((field) => b?.[field]).find(Boolean);
    const aMs = Date.parse(serializeDateish(aValue) || "") || 0;
    const bMs = Date.parse(serializeDateish(bValue) || "") || 0;
    return bMs - aMs;
  });
  return ranked.slice(0, max);
}

function summarizeBookings(bookings) {
  return takeLatest(
    bookings.map((booking) => normalizeRecord({
      id: booking.id,
      jobNumber: booking.jobNumber || "",
      client: booking.client || "",
      location: booking.location || "",
      status: booking.status || "",
      bookingDates: Array.isArray(booking.bookingDates) ? booking.bookingDates.slice(0, 10) : [],
      vehicles: Array.isArray(booking.vehicles)
        ? booking.vehicles
            .map((v) => (typeof v === "string" ? v : v?.name || v?.registration || v?.id || ""))
            .filter(Boolean)
            .slice(0, 8)
        : [],
      employees: Array.isArray(booking.employees)
        ? booking.employees
            .map((e) => (typeof e === "string" ? e : e?.name || e?.displayName || e?.userCode || ""))
            .filter(Boolean)
            .slice(0, 10)
        : [],
      updatedAt: booking.updatedAt || booking.createdAt || null,
    })),
    24,
    ["updatedAt"]
  );
}

function summarizeEmployees(employees) {
  return employees.slice(0, 40).map((employee) =>
    normalizeRecord({
      id: employee.id,
      name: employee.name || employee.fullName || "",
      userCode: employee.userCode || employee.employeeCode || "",
      role: employee.role || "",
      department: employee.department || "",
      email: employee.email || "",
      isEnabled: employee.isEnabled,
    })
  );
}

function summarizeVehicles(vehicles) {
  return vehicles.slice(0, 50).map((vehicle) =>
    normalizeRecord({
      id: vehicle.id,
      name: vehicle.name || "",
      registration: vehicle.registration || "",
      category: vehicle.category || "",
      motDueDate: vehicle.motDueDate || vehicle.mot || null,
      serviceDueDate: vehicle.serviceDueDate || vehicle.service || null,
      status: vehicle.status || "",
    })
  );
}

function summarizeTimesheets(timesheets) {
  return takeLatest(
    timesheets.map((timesheet) =>
      normalizeRecord({
        id: timesheet.id,
        employeeName: timesheet.employeeName || "",
        employeeCode: timesheet.employeeCode || "",
        weekStart: timesheet.weekStart || "",
        status: timesheet.status || (timesheet.submitted ? "submitted" : "draft"),
        submitted: !!timesheet.submitted,
        submittedAt: timesheet.submittedAt || timesheet.updatedAt || null,
        notes: safeString(timesheet.notes).slice(0, 240),
      })
    ),
    24,
    ["submittedAt", "updatedAt"]
  );
}

function summarizeVehicleIssues(items) {
  return takeLatest(
    items.map((issue) =>
      normalizeRecord({
        id: issue.id,
        vehicleName: issue.vehicleName || "",
        category: issue.category || "",
        status: issue.status || "",
        description: safeString(issue.description).slice(0, 280),
        reporterName: issue.reporterName || "",
        createdAt: issue.createdAt || issue.updatedAt || null,
      })
    ),
    24,
    ["createdAt", "updatedAt"]
  );
}

function summarizeMaintenanceJobs(items) {
  return takeLatest(
    items.map((job) =>
      normalizeRecord({
        id: job.id,
        title: job.title || job.jobTitle || "",
        vehicleId: job.vehicleId || "",
        vehicleName: job.vehicleName || "",
        status: job.status || "",
        priority: job.priority || "",
        dueDate: job.dueDate || null,
        updatedAt: job.updatedAt || job.createdAt || null,
      })
    ),
    24,
    ["updatedAt", "createdAt", "dueDate"]
  );
}

function summarizeChecks(items) {
  return takeLatest(
    items.map((check) =>
      normalizeRecord({
        id: check.id,
        vehicle: check.vehicle || "",
        driverName: check.driverName || "",
        status: check.status || "",
        dateISO: check.dateISO || check.date || "",
        updatedAt: check.updatedAt || check.createdAt || null,
      })
    ),
    24,
    ["updatedAt", "createdAt", "dateISO"]
  );
}

function buildCompactContext(contextPayload) {
  const lines = [];
  lines.push(`Role: ${contextPayload.user?.role || "user"}`);
  lines.push(
    `Counts: bookings=${contextPayload.metrics.bookings}, employees=${contextPayload.metrics.employees}, vehicles=${contextPayload.metrics.vehicles}, timesheets=${contextPayload.metrics.timesheets}, vehicleIssues=${contextPayload.metrics.vehicleIssues}, maintenanceJobs=${contextPayload.metrics.maintenanceJobs}`
  );

  const pushSection = (title, items, formatter) => {
    if (!Array.isArray(items) || items.length === 0) return;
    lines.push(`${title}:`);
    items.forEach((item) => lines.push(`- ${formatter(item)}`));
  };

  pushSection("Bookings", contextPayload.bookings, (item) =>
    [item.jobNumber || item.id, item.client, item.location, item.status]
      .filter(Boolean)
      .join(" | ")
  );
  pushSection("Vehicles", contextPayload.vehicles, (item) =>
    [item.name || item.id, item.registration, item.category, item.status]
      .filter(Boolean)
      .join(" | ")
  );
  pushSection("Vehicle issues", contextPayload.vehicleIssues, (item) =>
    [item.vehicleName || item.id, item.category, item.status, item.description]
      .filter(Boolean)
      .join(" | ")
  );
  pushSection("Timesheets", contextPayload.timesheets, (item) =>
    [item.employeeName || item.employeeCode, item.weekStart, item.status, item.notes]
      .filter(Boolean)
      .join(" | ")
  );
  pushSection("Maintenance jobs", contextPayload.maintenanceJobs, (item) =>
    [item.title || item.id, item.vehicleName || item.vehicleId, item.status, item.priority]
      .filter(Boolean)
      .join(" | ")
  );

  return lines.join("\n");
}

export async function POST(req) {
  try {
    if (!openai) {
      return NextResponse.json(
        { error: "AI Assistant temporarily disabled (no API key set)." },
        { status: 503 }
      );
    }

    const verifiedUser = await verifyFirebaseIdTokenFromRequest(req);
    if (!verifiedUser?.uid) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { prompt, messages, clientContext } = await req.json();
    if (!prompt || !safeString(prompt)) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }
    const userRole = safeString(clientContext?.user?.role).toLowerCase() || "user";
    let contextPayload = null;
    if (clientContext && typeof clientContext === "object") {
      contextPayload = normalizeRecord(clientContext);
    } else {
      return NextResponse.json(
        { error: "Assistant context was not loaded in the browser. Refresh the page and try again." },
        { status: 400 }
      );
    }

    const compactContext = buildCompactContext(contextPayload);
    const systemContext = [
      "You are Bickers Assistant, an operations AI inside the company software.",
      "You help with bookings, timesheets, workshop jobs, maintenance, vehicles, staffing, holidays, and operational questions.",
      `The signed-in user's role is: ${userRole || "user"}.`,
      "Answer clearly and practically. Prefer concise operational summaries over theory.",
      "If the data does not support a claim, say that directly.",
      "When useful, cite the specific record ids, job numbers, employee codes, vehicle registrations, or dates you relied on.",
      "Do not invent records or hidden data.",
      "Context summary follows.",
      compactContext,
    ].join("\n\n");

    const messageHistory = Array.isArray(messages)
      ? messages
          .filter((item) => item && (item.role === "user" || item.role === "assistant"))
          .slice(-8)
          .map((item) => ({
            role: item.role,
            content: safeString(item.content),
          }))
      : [{ role: "user", content: safeString(prompt) }];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemContext },
        ...messageHistory,
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? "No reply from assistant.";
    return NextResponse.json({
      reply,
      contextMeta: contextPayload.metrics,
    });
  } catch (error) {
    console.error("AI Assistant Error:", error);
    const message =
      error?.status === 429
        ? "The assistant hit an OpenAI rate limit or quota limit."
        : error?.message
        ? `Assistant error: ${error.message}`
        : "Something went wrong with the assistant.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
