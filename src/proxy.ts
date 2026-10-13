/**
 * Route protection (Next.js 16 `proxy` - the former `middleware`).
 *
 * Verifies the session JWT and redirects unauthenticated users to the sign-in
 * page. Fine-grained authorisation (role permissions, facility scoping, consent
 * gates) is enforced again on the server in each page and server action,
 * because this layer is a convenience for navigation, not a security boundary.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "healthlink_session";

/**
 * Dev-only fallback secret. Must match the value in `lib/auth.ts`, and must be
 * overridden via HEALTHLINK_SECRET before any non-demonstration deployment —
 * otherwise anyone reading this source could forge a session token.
 */
const SECRET = new TextEncoder().encode(
  process.env.HEALTHLINK_SECRET ?? "healthlink-development-secret-do-not-use-in-production-4f8a2c",
);

/** Paths reachable without a session. */
const PUBLIC_PATHS = ["/login", "/track", "/fhir"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let tokenValid = false;
  if (token) {
    try {
      await jwtVerify(token, SECRET, { issuer: "healthlink", audience: "healthlink-app" });
      tokenValid = true;
    } catch {
      tokenValid = false;
    }
  }

  // Public paths are always reachable. In particular /login must NOT redirect a
  // holder of an unexpired token away, because the token alone does not prove the
  // session is still live: it can have been revoked server-side, or the user
  // database can have been rebuilt. The /login page performs the authoritative
  // check against the session store and redirects only when the session is real.
  if (isPublic) return NextResponse.next();

  if (!tokenValid) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    const response = NextResponse.redirect(url);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on every path except Next.js internals and static assets.
     * Note: `/fhir` is deliberately NOT excluded - the FHIR facade performs its
     * own authentication so that third-party clients receive a proper 401 with
     * an OperationOutcome rather than an HTML redirect.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)$).*)",
  ],
};
