import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

// inferAdditionalFields mirrors the server's user.additionalFields (e.g. `role`)
// onto the typed client — `import type` keeps server code out of the bundle.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const signInWithGithub = () =>
  authClient.signIn.social({ provider: "github" });

// Attach another Gmail account to the signed-in user.
export const linkGoogle = async () => {
  try {
    const [{ connectGmail }, { toast }] = await Promise.all([
      import("@/lib/connections/google-client"),
      import("sonner"),
    ]);
    const account = await connectGmail();
    toast.success("Gmail connected", { description: account.email });
    return account;
  } catch (error) {
    const { toast } = await import("sonner");
    toast.error("Could not connect Gmail", {
      description: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

// Link a GitHub account to the signed-in user (not a new account) so the Pull
// requests page can read PRs via the GitHub API. `repo` covers private PRs;
// `read:user` resolves the viewer. Returns to the PRs page after the OAuth hop.
export const linkGithub = () =>
  authClient.linkSocial({
    provider: "github",
    scopes: ["read:user", "repo"],
    callbackURL: "/pull-requests",
  });

export const { signOut, useSession } = authClient;

import {
  vaultEmailForCreate,
  vaultEmailForUnlock,
  LOCAL_VAULT_NAME,
} from "@/lib/vault/constants";

export const createVaultSession = (authPassword: string) =>
  authClient.signUp.email({
    email: vaultEmailForCreate(),
    name: LOCAL_VAULT_NAME,
    password: authPassword,
  });

export const unlockVaultSession = (authPassword: string) =>
  authClient.signIn.email({
    email: vaultEmailForUnlock(),
    password: authPassword,
    rememberMe: true,
  });
