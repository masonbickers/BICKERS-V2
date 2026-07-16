// src/app/layout.js
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./theme.css";
import "./globals.css";
import "./calendar-integration.css";
import { AuthProvider } from "./context/authContext"; 
import ProtectedLayout from "./components/ProtectedLayout"; 
import AppCacheRefresh from "./components/AppCacheRefresh";
import GlobalThemeProvider from "./components/GlobalThemeProvider";

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
          <AuthProvider>
            <AppCacheRefresh />
            <GlobalThemeProvider />
            <ProtectedLayout>
              {children}
            </ProtectedLayout>
          </AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
