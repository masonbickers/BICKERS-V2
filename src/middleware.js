import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PUBLIC_PAGE_PREFIXES = ["/login", "/auth/complete", "/credential-reset-required"];
const isPublicPage = (pathname) => PUBLIC_PAGE_PREFIXES.some(
  (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
);

export default clerkMiddleware(async (auth, req) => {
  // API handlers return the documented 401/403 responses themselves. Protecting
  // document routes here prevents protected React trees from rendering first.
  const pathname = req.nextUrl.pathname;
  if (!pathname.startsWith("/api/") && !isPublicPage(pathname)) {
    const session = await auth();
    if (!session.userId) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect_url", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
