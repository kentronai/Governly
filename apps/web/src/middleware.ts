import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isKentronEmail } from "@/lib/utils/validateEmail";

// Routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/health",
  // Shadow AI: the scanner script (public) and its upload, which verifies a scan-only API key.
  "/shadow-ai-scan.py",
  "/api/shadow-ai/upload",
  // Machine-to-machine cron entrypoints. These are not unauthenticated: each
  // route verifies AGENT_DISCOVERY_CRON_SECRET / CRON_SECRET with a
  // timing-safe compare. Without this exemption Clerk 302s them to /sign-in
  // and the scheduled run silently never executes.
  "/api/cron(.*)",
  "/404(.*)",
  "/unauthorized(.*)",
  "/network-error",
  "/unauthorized",
  "/",
  "/health",
  "/public(.*)",
  "/_next(.*)",
  "/favicon.ico",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const isUserAdmin = (orgRole: string | undefined): boolean => {
  if (!orgRole) return false;
  return ["org:admin", "admin", "org:owner"].includes(orgRole);
};

export default clerkMiddleware(async (auth, req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Allow public routes without any checks
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Get auth info
  const { userId, orgId, orgRole, sessionClaims } = await auth();

  // Protect all routes - require authentication
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set(
      "redirect_url",
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  // Get user email from session claims
  const userEmail = sessionClaims?.email as string | undefined;

  // If user has no organization context, redirect to onboarding
  if (!orgId && pathname !== "/admin/client-onboarding") {
    // Only Kentron users can access admin to create organizations
    const isKentronUser = userEmail ? isKentronEmail(userEmail) : false;
    if (isKentronUser) {
      return NextResponse.redirect(
        new URL("/admin/client-onboarding", req.url),
      );
    } else {
      // Regular users need to wait for invitation
      return NextResponse.redirect(
        new URL("/unauthorized?reason=no-organization", req.url),
      );
    }
  }

  // The onboarding page checks the user's primary Clerk email server-side.
  // Clerk's default session claims do not contain `email`, so middleware must
  // not reject the route based on sessionClaims.email.

  // Tenant routes: "no active org" is redirected above; membership of the
  // URL's tenant is enforced by [tenant]/layout.tsx and by every server action
  // (@/lib/server/tenant-access).

  // Check admin routes (except onboarding which is handled above)
  if (isAdminRoute(req) && pathname !== "/admin/client-onboarding") {
    if (!orgId || !isUserAdmin(orgRole)) {
      return NextResponse.redirect(
        new URL("/unauthorized?reason=admin-access-required", req.url),
      );
    }
  }

  // Redirect root to appropriate page (handled in page.tsx)
  // Middleware just ensures auth, page.tsx handles smart redirect

  // Allow access to all other authenticated routes. Pass the full path on so
  // server components ([tenant]/layout alias redirect, audit context) can see it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname + nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    // Anchor the asset extension list with `$` so middleware ALSO runs for
    // paths like `/foo.js.map` or `/foo.css.br` — without the anchor, the
    // unanchored lookahead treats them as `.js`/`.css` and skips middleware,
    // which causes the 404 handler's <ClerkProvider> → auth() to throw with
    // "Clerk can't detect usage of clerkMiddleware()".
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$).*)",
    "/(api|trpc)(.*)",
  ],
};
