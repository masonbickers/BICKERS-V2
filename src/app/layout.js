// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/authContext"; 
import ProtectedLayout from "./components/ProtectedLayout"; 

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
   <html
     lang="en"
     className={`${geistSans.variable} ${geistMono.variable}`}
     suppressHydrationWarning
   >
     <body suppressHydrationWarning>
        <AuthProvider>
          <ProtectedLayout>
            {children}
          </ProtectedLayout>
        </AuthProvider>
      </body>
    </html>
  );
}

