// src/app/layout.js
import { ClerkProvider } from "@clerk/nextjs";
import "./theme.css";
import "./globals.css";
import "./calendar-integration.css";
import { AuthProvider } from "./context/authContext";
import ProtectedLayout from "./components/ProtectedLayout";
import GlobalThemeProvider from "./components/GlobalThemeProvider";
import ContentLabelsProvider from "./components/ContentLabelsProvider";
import SystemNotificationHost from "./components/SystemNotificationHost";
import DeploymentConfigProvider from "./components/DeploymentConfigProvider";
import { getPublicDeploymentConfig } from "./config/deploymentConfig";
import { deploymentMetadata } from "./config/deploymentConfigCore";

export function generateMetadata() {
  const deployment = getPublicDeploymentConfig();
  return deploymentMetadata(deployment);
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  const deployment = getPublicDeploymentConfig();
  if (process.env.NODE_ENV !== "production" && process.env.MAINTENANCE_E2E_HARNESS === "1") {
    return (
      <html lang="en" suppressHydrationWarning>
        <body suppressHydrationWarning>{children}</body>
      </html>
    );
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClerkProvider signInUrl="/login" signUpUrl="/login">
          <DeploymentConfigProvider config={deployment}>
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
          </DeploymentConfigProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
