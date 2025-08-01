"use client";
import { useRouter } from "next/navigation";

export default function ContactsPage() {
  const router = useRouter();

  const contacts = [
    {
      name: "Bickers Action Office",
      role: "24h General Enquiries",
      email: "action@bickers.co.uk",
      phone: "+44 (0)1449 761300",
    },
    {
      name: "Paul Bickers",
      role: "Managing Director / Technical Advice and Bookings",
      email: "paul@bickers.co.uk",
      phone: "+44 (0)7831 132009",
    },
    {
      name: "Adam Eastall",
      role: "Company Director / Technical Advice and Bookings",
      email: "adam@bickers.co.uk",
      phone: "+44 (0)7970 262918",
    },
    {
      name: "Toby Oxley",
      role: "Project and Transport Manager",
      email: "toby@bickers.co.uk",
      phone: "+44 (0)7563 988733",
    },
    {
      name: "Sophie Albrow",
      role: "Bookings Manager",
      email: "sophie@bickers.co.uk",
      phone: "+44 (0)7565 621206",
    },
    {
      name: "Mel Hadfield",
      role: "Finance Manager",
      email: "mel@bickers.co.uk",
    },
  ];

  return (
    <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto", fontFamily: "Arial, sans-serif", color: "#111" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <h1 style={{ color: "#fff" }}>Contacts</h1>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            backgroundColor: "#1976d2",
            color: "#white",
            border: "none",
            padding: "10px 16px",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      {contacts.map((c, i) => (
        <div
          key={i}
          style={{
            backgroundColor: "#f9f9f9",
            padding: "20px",
            marginBottom: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
          }}
        >
          <h2 style={{ marginBottom: 5 }}>{c.name}</h2>
          <p style={{ margin: 0, fontWeight: "bold" }}>{c.role}</p>
          {c.email && (
            <p style={{ margin: "4px 0" }}>
              📧 <a href={`mailto:${c.email}`}>{c.email}</a>
            </p>
          )}
          {c.phone && (
            <p style={{ margin: "4px 0" }}>
              📞 <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
