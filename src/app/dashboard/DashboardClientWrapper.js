"use client";

import { useSearchParams } from "next/navigation";

export default function DashboardClientWrapper({ children }) {
  const searchParams = useSearchParams();
  const bookingSaved = searchParams.get("success") === "true";

  return (
    <>
      {bookingSaved && (
        <div
          style={{
            backgroundColor: "#d4edda",
            color: "#155724",
            padding: "10px 20px",
            borderRadius: "5px",
            marginBottom: "20px",
            border: "1px solid #c3e6cb",
          }}
        >
          ✅ Booking saved successfully!
        </div>
      )}
      {children}
    </>
  );
}
