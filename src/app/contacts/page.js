"use client";

import layoutStyles from "./page.styles.module.css";import { useRouter } from "next/navigation";

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
    <div className={layoutStyles.extracted1}>
      <div className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>
          <h1 className={layoutStyles.extracted4}>Contacts</h1>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className={layoutStyles.extracted5}
        >
          ← Back to Dashboard
        </button>
      </div>

      {contacts.map((c, i) => (
        <div
          key={i}
          className={layoutStyles.extracted6}
        >
          <h2 className={layoutStyles.extracted7}>{c.name}</h2>
          <p className={layoutStyles.extracted8}>{c.role}</p>
          {c.email && (
            <p className={layoutStyles.extracted9}>
               <a href={`mailto:${c.email}`}>{c.email}</a>
            </p>
          )}
          {c.phone && (
            <p className={layoutStyles.extracted10}>
               <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
