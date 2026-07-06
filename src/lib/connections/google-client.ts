import type { Account } from "@/lib/account";
import {
  GOOGLE_GMAIL_SCOPES,
  loadGoogleProviderConfig,
  saveConnectedGmailAccount,
  saveGoogleProviderConfig,
  type ConnectedGmailAccount,
  type GoogleProviderConfig,
} from "@/lib/connections/provider-store";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const GIS_SCRIPT_ID = "google-identity-services";
const GIS_SRC = "https://accounts.google.com/gsi/client";

async function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) return;
  const existing = document.getElementById(
    GIS_SCRIPT_ID,
  ) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Identity Services failed to load")),
        {
          once: true,
        },
      );
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Identity Services failed to load")),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

async function ensureGoogleProviderConfig(): Promise<GoogleProviderConfig> {
  const existing = await loadGoogleProviderConfig();
  if (existing?.clientId) return existing;

  const clientId = window.prompt(
    "Paste your Google OAuth web client ID. It will be encrypted in this browser.",
  );
  if (!clientId?.trim()) {
    throw new Error("Google OAuth client ID is required to connect Gmail.");
  }
  return saveGoogleProviderConfig(clientId);
}

async function requestGoogleToken(config: GoogleProviderConfig) {
  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services is unavailable.");

  return new Promise<GoogleTokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: config.clientId,
      scope: config.scopes.join(" "),
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        resolve(response);
      },
      error_callback: (error) => reject(new Error(String(error))),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export async function fetchGmailAccountSummary(
  accessToken: string,
  accountId?: string,
): Promise<Account> {
  const params = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  const res = await fetch(`/api/accounts${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    account?: Account;
    error?: string;
  };
  if (!res.ok || !data.account) {
    throw new Error(
      data.error ?? `Gmail profile failed with HTTP ${res.status}`,
    );
  }
  return data.account;
}

export async function connectGmail(): Promise<ConnectedGmailAccount> {
  const config = await ensureGoogleProviderConfig();
  const token = await requestGoogleToken(config);
  if (!token.access_token)
    throw new Error("Google did not return an access token.");
  const summary = await fetchGmailAccountSummary(token.access_token);
  return saveConnectedGmailAccount({
    accountId: summary.accountId,
    email: summary.email,
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scope: token.scope ?? GOOGLE_GMAIL_SCOPES.join(" "),
  });
}
