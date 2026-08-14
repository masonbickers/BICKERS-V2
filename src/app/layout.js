// src/app/layout.js
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./theme.css";
import "./globals.css";
import "./calendar-integration.css";
import { AuthProvider } from "./context/authContext";
import ProtectedLayout from "./components/ProtectedLayout";
import GlobalThemeProvider from "./components/GlobalThemeProvider";
import ContentLabelsProvider from "./components/ContentLabelsProvider";
import SystemNotificationHost from "./components/SystemNotificationHost";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Bickers Booking System",
  description: "Manage your bookings, vehicles and employees",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bickers",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  if (process.env.NODE_ENV !== "production" && process.env.MAINTENANCE_E2E_HARNESS === "1") {
    return (
      <html lang="en" className={inter.variable} suppressHydrationWarning>
        <body suppressHydrationWarning>{children}</body>
      </html>
    );
  }
  return (
   <html
     lang="en"
     className={inter.variable}
     suppressHydrationWarning
   >
     <body suppressHydrationWarning>
        <ClerkProvider signInUrl="/login" signUpUrl="/login">
          <AuthProvider>
            <GlobalThemeProvider>
              <ContentLabelsProvider>
                <SystemNotificationHost />
                <ProtectedLayout>
                  {children}
                </ProtectedLayout>
              </ContentLabelsProvider>
            </GlobalThemeProvider>
          </AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
