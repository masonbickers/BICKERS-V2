"use server";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "../../../../firebaseConfig";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

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

    const userSnap = await getDoc(doc(db, "users", verifiedUser.uid));
    const userRole = String(userSnap.data()?.role || "").toLowerCase();
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { prompt } = await req.json();
    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    const [bookingsSnap, employeesSnap, vehiclesSnap, holidaysSnap, hrSnap, maintenanceSnap] = await Promise.all([
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "vehicles")),
      getDocs(collection(db, "holidays")),
      getDocs(collection(db, "hr")),
      getDocs(collection(db, "maintenance")),
    ]);

    const bookings = bookingsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const employees = employeesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const vehicles = vehiclesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const holidays = holidaysSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const hr = hrSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const maintenance = maintenanceSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

    const systemContext = `
You are an assistant helping manage bookings, employees, vehicles, and maintenance.
Here is a sample of the current data:

- Bookings: ${JSON.stringify(bookings.slice(0, 3))}
- Employees: ${JSON.stringify(employees.slice(0, 3))}
- Vehicles: ${JSON.stringify(vehicles.slice(0, 3))}
- Holidays: ${JSON.stringify(holidays.slice(0, 3))}
- HR: ${JSON.stringify(hr.slice(0, 3))}
- Maintenance Logs: ${JSON.stringify(maintenance.slice(0, 3))}

Use this to answer operational questions efficiently and concisely.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemContext },
        { role: "user", content: String(prompt).trim() },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? "No reply from assistant.";
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("AI Assistant Error:", error);
    return NextResponse.json({ error: "Something went wrong with the assistant." }, { status: 500 });
  }
}
