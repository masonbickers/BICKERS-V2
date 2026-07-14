// src/app/layout.js
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./calendar-integration.css";
import LazyClientAppShell from "./components/LazyClientAppShell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Bickers Booking System",
  description: "Manage your bookings, vehicles and employees",
};

export default function RootLayout({ children }) {
  return (
   <html
     lang="en"
     className={inter.variable}
     suppressHydrationWarning
   >
     <body suppressHydrationWarning>
        <ClerkProvider signInUrl="/login" signUpUrl="/login">
          <LazyClientAppShell>{children}</LazyClientAppShell>
        </ClerkProvider>
      </body>
    </html>
  );
}

