import { tanstackStartCookies } from "better-auth/tanstack-start";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/db/prisma.server";

// Sign-in allowlist: comma-separated ALLOWED_EMAILS may create an account; others
// are rejected at creation. Empty/unset = open (local dev). Gates first-time
// account creation only, not subsequent sign-ins — existing users unaffected.
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-prod",
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  // The vault master password is the app login (local Better Auth email+password).
  // Gmail tokens are stored in the browser vault, not Better Auth's Account rows.
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      // Surfaced on session.user. input:false: a client can never set its own
      // role at sign-up/update — owner is granted out-of-band (DB / script).
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  account: {
    // Encrypt OAuth tokens at rest with BETTER_AUTH_SECRET. Reads stay
    // backward-compatible: better-auth returns plaintext rows untouched and
    // decrypts encrypted ones, so existing accounts work until a refresh (or the
    // backfill script) rewrites them encrypted.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      allowDifferentEmails: true, // let a different GitHub account link
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Reject creation for any email not on ALLOWED_EMAILS. This gates the
        // local vault session user before it is persisted.
        before: async (user) => {
          if (
            ALLOWED_EMAILS.size > 0 &&
            !ALLOWED_EMAILS.has(user.email.toLowerCase())
          ) {
            throw new APIError("FORBIDDEN", {
              message: "This account isn't on the access list yet.",
            });
          }
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
});
