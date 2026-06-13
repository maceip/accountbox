import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

// inferAdditionalFields mirrors the server's user.additionalFields (e.g. `role`)
// onto the typed client — `import type` keeps server code out of the bundle.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const signIn = () => authClient.signIn.social({ provider: "google" });
export const signInWithGithub = () =>
  authClient.signIn.social({ provider: "github" });

// Attach another Gmail account to the signed-in user.
export const linkGoogle = () =>
  authClient.linkSocial({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });

export const { signOut, useSession } = authClient;
