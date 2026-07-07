import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { opfsGet, opfsOpen, opfsPut } from "@/lib/db/opfs";
import type { VaultEnvelope } from "@/lib/vault/crypto";

export const Route = createFileRoute("/opfs-proof")({
  component: OpfsProofPage,
});

type ProofState =
  | { status: "idle"; message: string }
  | { status: "written"; token: string; payload: VaultEnvelope }
  | { status: "pass"; token: string; payload: VaultEnvelope }
  | { status: "fail"; message: string };

function proofEnvelope(token: string): VaultEnvelope {
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 310_000,
    authSalt: `auth-${token}`,
    vaultSalt: `vault-${token}`,
    iv: `iv-${token}`,
    ciphertext: `ciphertext-${token}`,
  };
}

function sameEnvelope(a: VaultEnvelope | null, b: VaultEnvelope): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function OpfsProofPage() {
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
          `phase1-${crypto.randomUUID?.() ?? Date.now()}`;
        const id = `phase1-${token}`;
        const payload = proofEnvelope(token);
        await opfsOpen();
        if (mode === "write") {
          await opfsPut("vault_envelope", id, payload);
          if (!alive) return;
          setState({ status: "written", token, payload });
          const url = new URL(window.location.href);
          url.searchParams.set("mode", "read");
          url.searchParams.set("token", token);
          window.history.replaceState(null, "", url.toString());
          return;
        }
        const stored = await opfsGet<VaultEnvelope>("vault_envelope", id);
        if (!alive) return;
        if (stored && sameEnvelope(stored, payload)) {
          setState({ status: "pass", token, payload: stored });
        } else {
          setState({
            status: "fail",
            message: `stored payload mismatch for ${id}`,
          });
        }
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
          phase 1 proof
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">
          OPFS SQLite reload proof
        </h1>
        <p
          className="mt-3 font-mono text-[12px] text-ink-subtle"
          data-opfs-proof-status={state.status}
        >
          {state.status === "idle" && state.message}
          {state.status === "written" && `written ${state.token}; reload now`}
          {state.status === "pass" && `pass ${state.token}`}
          {state.status === "fail" && state.message}
        </p>
        {"payload" in state && (
          <pre
            className="mt-4 overflow-x-auto rounded bg-canvas p-3 font-mono text-[11px] text-ink-muted"
            data-opfs-proof-json
          >
            {JSON.stringify(state.payload, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}
