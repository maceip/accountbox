import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  getGmailAccessToken,
  listConnectedGmailAccounts,
  loadGoogleProviderConfig,
  saveConnectedGmailAccount,
  saveGoogleProviderConfig,
} from "@/lib/connections/provider-store";
import { opfsGet, opfsList, opfsOpen, opfsPut } from "@/lib/db/opfs";
import {
  openVault,
  prepareNewVault,
  type VaultEnvelope,
} from "@/lib/vault/crypto";
import { unlockVaultMemory } from "@/lib/vault/store";

export const Route = createFileRoute("/opfs-connections-proof")({
  component: OpfsConnectionsProofPage,
});

type ProofState =
  | { status: "idle"; message: string }
  | { status: "written"; token: string }
  | {
      status: "pass";
      token: string;
      email: string;
      rawPlaintextAbsent: boolean;
    }
  | { status: "fail"; message: string };

const VAULT_TABLE = "phase3_proof_vault";
const CONFIG_TABLE = "provider_config";
const ACCOUNT_TABLE = "connected_account";

function proofValues(token: string) {
  return {
    vaultId: `phase3-${token}`,
    password: `phase3-password-${token}`,
    clientId: `phase3-client-${token}.apps.googleusercontent.com`,
    accountId: `phase3-account-${token}`,
    email: `phase3-${token}@example.invalid`,
    accessToken: `phase3-access-token-${token}`,
  };
}

function containsAnyPlaintext(value: unknown, needles: string[]) {
  const text = JSON.stringify(value);
  return needles.some((needle) => text.includes(needle));
}

async function unlockProofVault(token: string) {
  const values = proofValues(token);
  const envelope = await opfsGet<VaultEnvelope>(VAULT_TABLE, values.vaultId);
  if (!envelope) throw new Error(`proof vault envelope missing for ${token}`);
  const opened = await openVault(values.password, envelope);
  unlockVaultMemory(opened.payload, opened.key);
}

function OpfsConnectionsProofPage() {
  const params = useMemo(
    () =>
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
    [],
  );
  const [state, setState] = useState<ProofState>({
    status: "idle",
    message: "opening OPFS SQLite...",
  });

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const mode = params.get("mode") ?? "read";
        const token =
          params.get("token") ??
          `phase3-${crypto.randomUUID?.() ?? Date.now()}`;
        const values = proofValues(token);

        await opfsOpen();
        if (mode === "write") {
          const prepared = await prepareNewVault(values.password);
          await opfsPut(VAULT_TABLE, values.vaultId, prepared.envelope);
          unlockVaultMemory(prepared.payload, prepared.key);
          await saveGoogleProviderConfig(values.clientId);
          await saveConnectedGmailAccount({
            accountId: values.accountId,
            email: values.email,
            accessToken: values.accessToken,
            expiresAt: Date.now() + 60 * 60 * 1000,
            scope: "https://www.googleapis.com/auth/gmail.modify",
          });
          if (!alive) return;
          setState({ status: "written", token });
          const url = new URL(window.location.href);
          url.searchParams.set("mode", "read");
          url.searchParams.set("token", token);
          window.history.replaceState(null, "", url.toString());
          return;
        }

        await unlockProofVault(token);
        const config = await loadGoogleProviderConfig();
        const accounts = await listConnectedGmailAccounts();
        const account = accounts.find(
          (entry) => entry.accountId === values.accountId,
        );
        const tokenFromStore = await getGmailAccessToken(values.accountId);
        const rawConfig = await opfsGet<unknown>(CONFIG_TABLE, "google");
        const rawAccounts = await opfsList<unknown>(ACCOUNT_TABLE);
        const rawPlaintextAbsent = !containsAnyPlaintext(
          { rawConfig, rawAccounts },
          [values.clientId, values.accountId, values.email, values.accessToken],
        );

        if (
          config?.clientId !== values.clientId ||
          account?.email !== values.email ||
          tokenFromStore !== values.accessToken ||
          !rawPlaintextAbsent
        ) {
          throw new Error("encrypted provider/account reload proof failed");
        }

        if (!alive) return;
        setState({
          status: "pass",
          token,
          email: values.email,
          rawPlaintextAbsent,
        });
      } catch (error) {
        if (!alive) return;
        setState({
          status: "fail",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [params]);

  return (
    <main className="grid min-h-svh place-items-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-xl rounded border border-hairline bg-surface-1 p-6">
        <p className="font-mono text-[11px] tracking-wide text-ink-muted uppercase">
          phase 3 proof
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">
          OPFS connection storage proof
        </h1>
        <p
          className="mt-3 font-mono text-[12px] text-ink-subtle"
          data-opfs-connections-proof-status={state.status}
          data-opfs-connections-proof-plaintext={
            "rawPlaintextAbsent" in state
              ? state.rawPlaintextAbsent
                ? "absent"
                : "present"
              : "unknown"
          }
        >
          {state.status === "idle" && state.message}
          {state.status === "written" && `written ${state.token}; reload now`}
          {state.status === "pass" && `pass ${state.email}`}
          {state.status === "fail" && state.message}
        </p>
      </div>
    </main>
  );
}
