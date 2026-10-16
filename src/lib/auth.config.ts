import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth settings shared by the middleware and the full auth
 * config in src/lib/auth.ts.
 *
 * The middleware runs in the Edge runtime, which cannot load Prisma or
 * bcrypt. With the JWT session strategy, checking whether a request is signed
 * in only needs the session cookie, so nothing here touches the database.
 * The Credentials provider (which does) is added in auth.ts only.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
