import { tanstackStartCookies } from "better-auth/tanstack-start";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma.server";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      accessType: "offline",
      prompt: "select_account consent",
      scope: ["https://www.googleapis.com/auth/gmail.modify"],
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      // Surfaced on session.user. input:false means a client can never set its
      // own role at sign-up/update — owner is granted out-of-band (DB / script).
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  account: {
    // Encrypt OAuth access/refresh/id tokens at rest with BETTER_AUTH_SECRET.
    // Reads stay backward-compatible: better-auth returns plaintext rows
    // untouched and decrypts encrypted ones, so existing accounts keep working
    // until a refresh (or the backfill script) rewrites them encrypted.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: true, // let a second, different Gmail link
    },
  },
  plugins: [tanstackStartCookies()],
});
