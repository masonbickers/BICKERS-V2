import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicPage = createRouteMatcher(["/", "/login(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);
const maintenanceE2EMode =
  process.env.NODE_ENV !== "production" && process.env.MAINTENANCE_E2E_HARNESS === "1";

const protectedMiddleware = maintenanceE2EMode ? null : clerkMiddleware(async (auth, request) => {
  if (!isPublicPage(request) && !isApiRoute(request)) {
    await auth.protect();
  }
});

const maintenanceE2EMiddleware = () => NextResponse.next();

export default maintenanceE2EMode
  ? maintenanceE2EMiddleware
  : protectedMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
