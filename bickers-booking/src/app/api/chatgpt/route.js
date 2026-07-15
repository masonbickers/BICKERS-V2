"use server";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "../../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

// 🔐 Conditionally set up OpenAI if key exists
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

export async function POST(req) {
  try {
    if (!openai) {
      console.warn("⚠️ OPENAI_API_KEY missing, skipping AI assistant.");
      return NextResponse.json(
        { error: "AI Assistant temporarily disabled (no API key set)." },
        { status: 503 }
      );
    }

    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    // 🧲 Fetch data from Firebase
    const [bookingsSnap, employeesSnap, vehiclesSnap, holidaysSnap, hrSnap, maintenanceSnap] = await Promise.all([
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "vehicles")),
      getDocs(collection(db, "holidays")),
      getDocs(collection(db, "hr")),
      getDocs(collection(db, "maintenance")),
    ]);

    // 🗃️ Map snapshot data
    const bookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const vehicles = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const holidays = holidaysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const hr = hrSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const maintenance = maintenanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 🧠 Compact context for token limit
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

    // 🧠 Ask ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemContext },
        { role: "user", content: prompt },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? "No reply from assistant.";

    return NextResponse.json({ reply });

  } catch (error) {
    console.error("❌ AI Assistant Error:", error);
    return NextResponse.json({ error: "Something went wrong with the assistant." }, { status: 500 });
  }
}
