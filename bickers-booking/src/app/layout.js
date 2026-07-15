// app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HeaderSidebarLayout from "./components/HeaderSidebarLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Bickers Booking System",
  description: "Manage your bookings, vehicles and employees",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
<body style={{ margin: 0, padding: 0 }}>
      {children}
      </body>
    </html>
  );
}
