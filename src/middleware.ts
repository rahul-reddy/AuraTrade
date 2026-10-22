import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge runtime: use the DB-free config. Importing src/lib/auth.ts here would
// pull Prisma into the Edge bundle and break `next build`.
const { auth } = NextAuth(authConfig);
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;

  const isAuthRoute = nextUrl.pathname.startsWith("/login") ||
    nextUrl.pathname.startsWith("/register");

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isAuthRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Keep the public brand assets available before sign-in. Match only these
  // exact files; other /brand paths and arbitrary SVG/PNG URLs stay protected.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|brand/aura-mark\\.svg$|brand/apple-touch-icon\\.png$).*)",
  ],
};
