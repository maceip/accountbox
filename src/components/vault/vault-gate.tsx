import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createVaultSession, unlockVaultSession } from "@/lib/auth/auth-client";
import {
  generateMasterPassword,
  openVault,
  prepareNewVault,
  type VaultEnvelope,
} from "@/lib/vault/crypto";
import { loadVaultEnvelope, saveVaultEnvelope } from "@/lib/vault/opfs-store";
import {
  lockVaultMemory,
  unlockVaultMemory,
  useVaultState,
} from "@/lib/vault/store";
import {
  downloadVaultExport,
  folderShareSupported,
  importVaultFile,
  loadVaultFromFolder,
  saveVaultToFolder,
} from "@/lib/vault/portability";
import { probeAgentSupport } from "@/lib/runtime/agent-preload";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GateCard, GateTelemetry } from "@/components/shell/gate-card";
import { AccountBoxBrand, AccountBoxMark } from "@/components/shell/accountbox-mark";

/** The context the orphaned landing page used to provide, condensed to three
 *  lines beside the setup card on md+ (hidden on phones — the card's own
 *  header caption carries the message there). */
function PitchPanel() {
  return (
    <div className="hidden max-w-[360px] flex-col gap-5 md:flex">
      <div className="flex items-center gap-3">
        <AccountBoxBrand className="size-9" markClassName="size-8" />
        <div>
          <h1 className="text-[18px] font-semibold">AccountBox</h1>
          <p className="font-mono text-[11px] text-ink-subtle">
            private agent workspace
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-3 text-[13px] leading-normal text-ink-subtle">
        <li>
          <strong className="text-ink">A local agent, not a cloud one.</strong>{" "}
          The model runs on this machine's GPU — prompts and plans never leave
          it.
        </li>
        <li>
          <strong className="text-ink">Your mail stays in Gmail.</strong> Read
          and sent through the Gmail API; nothing is stored on a server.
        </li>
        <li>
          <strong className="text-ink">The workspace is yours.</strong>{" "}
          Everything lives in this browser, exportable as a file you control.
        </li>
      </ul>
    </div>
  );
}

/** Honest device verdict shown under the setup card when the local agent can't
 *  run here (no WebGPU / tiny GPU). Mail features are unaffected. */
function AgentSupportNote() {
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    probeAgentSupport().then((r) => {
      if (alive && !r.ok) setReason(r.reason);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!reason) return null;
  return (
    <p className="mt-3 font-mono text-[11px] text-ink-subtle">
      Heads up: the local agent won't run on this device ({reason}). Mail still
      works.
    </p>
  );
}

/** Setup/recovery screens share this shell: centered card on phones, pitch +
 *  card two-column on md+ (a 50/50 split keeps foldable hinges in the gutter). */
function GateShell({ children }: { children: ReactNode }) {
  return (
    <main className="wb-grain relative grid min-h-svh w-full flex-1 place-items-center overflow-hidden bg-canvas px-5 text-ink">
      <div
        aria-hidden
        className="vault-grid-bg pointer-events-none absolute inset-0 opacity-[0.04]"
      />
      <div className="relative z-10 flex w-full max-w-[820px] items-center justify-center gap-12 md:justify-between">
        <PitchPanel />
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}

export function VaultGate({ children }: { children: ReactNode }) {
  const vault = useVaultState();
  const [envelope, setEnvelope] = useState<VaultEnvelope | null | "loading">(
    "loading",
  );

  useEffect(() => {
    loadVaultEnvelope()
      .then(setEnvelope)
      .catch(() => setEnvelope(null));
  }, []);

  useEffect(() => {
    const onPageHide = () => lockVaultMemory();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  if (vault.status === "unlocked") return <>{children}</>;

  if (envelope === "loading") {
    return (
      <main className="grid min-h-svh w-full flex-1 place-items-center bg-canvas text-ink">
        <div className="font-mono text-[11px]">loading workspace…</div>
      </main>
    );
  }

  return envelope ? (
    <UnlockForm envelope={envelope} />
  ) : (
    <SetupForm onCreated={() => loadVaultEnvelope().then(setEnvelope)} />
  );
}

function SetupForm({ onCreated }: { onCreated: () => void }) {
  const isMobile = useIsMobile();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  // Phones lead with the generated recovery key (typing 12+ chars twice on a
  // soft keyboard is hostile); "set my own password" reveals the fields.
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const showFields = !isMobile || manual;

  const create = async (mp: string) => {
    setPending(true);
    try {
      const p = await prepareNewVault(mp);
      const s = (await createVaultSession(p.authPassword)) as {
        error?: { message: string };
      } | null;
      if (s?.error) throw new Error(s.error.message);
      await saveVaultEnvelope(p.envelope);
      unlockVaultMemory(p.payload, p.key);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const generate = () => {
    setError(null);
    setGeneratedPassword(generateMasterPassword());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (generatedPassword) {
      await create(generatedPassword);
      return;
    }
    if (!password && !confirm) {
      generate();
      return;
    }
    if (password.length < 12 || password !== confirm) {
      setError("Passwords must match and be >=12 chars");
      return;
    }
    await create(password);
  };

  if (generatedPassword) {
    return (
      <GateShell>
        <GateCard>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h2 className="text-[20px] font-semibold">
                Save this recovery key
              </h2>
              <p className="text-[13px] text-ink-subtle">
                Unlocks the workspace after reload.
              </p>
            </div>
            <code className="bg-surface-2 p-2 font-mono break-all">
              {generatedPassword}
            </code>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(generatedPassword)}
              >
                Copy
              </Button>
              <Button type="button" variant="outline" onClick={generate}>
                Regenerate
              </Button>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Setup Secure Workspace"}
            </Button>
          </form>
        </GateCard>
      </GateShell>
    );
  }

  return (
    <GateShell>
      <GateCard>
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <AccountBoxBrand className="size-9" markClassName="size-8" />
          <div>
            <h1 className="text-[18px] font-semibold">AccountBox</h1>
            <p className="font-mono text-[11px] text-ink-subtle">
              private agent workspace
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold">
            {showFields ? "Set a master password" : "Create your workspace"}
          </h2>
          <p className="text-[12px] leading-normal text-ink-subtle">
            This creates a private workspace{" "}
            <strong className="text-ink">in this browser</strong>. It does not
            follow you to other browsers or devices — use the workspace file for
            that.
          </p>
          {showFields ? (
            <>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master password"
                autoFocus={!isMobile}
              />
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm"
              />
              {error && <p className="text-[13px] text-label-red">{error}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Setup Secure Workspace"}
              </Button>
              <button
                type="button"
                onClick={generate}
                className="cursor-pointer self-start font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Or generate a recovery key for me
              </button>
            </>
          ) : (
            <>
              {error && <p className="text-[13px] text-label-red">{error}</p>}
              <Button type="button" disabled={pending} onClick={generate}>
                Generate a recovery key
              </Button>
              <button
                type="button"
                onClick={() => setManual(true)}
                className="cursor-pointer self-start font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Set my own password instead
              </button>
            </>
          )}
          <div className="border-t border-hairline pt-3">
            <p className="text-[12px] text-ink-subtle">
              Already have a workspace on another browser or device?
            </p>
            <div className="mt-2 flex items-center gap-4">
              <label className="inline-block">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setError(null);
                    try {
                      await importVaultFile(f);
                      onCreated(); // envelope now exists -> gate re-renders as Unlock
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  }}
                />
                <span className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink">
                  Import workspace file
                </span>
              </label>
              {folderShareSupported() && (
                <button
                  type="button"
                  className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
                  onClick={async () => {
                    setError(null);
                    try {
                      await loadVaultFromFolder();
                      onCreated();
                    } catch (err) {
                      if (
                        err instanceof DOMException &&
                        err.name === "AbortError"
                      )
                        return; // user cancelled picker
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  }}
                >
                  Load from folder…
                </button>
              )}
            </div>
          </div>
        </form>
      </GateCard>
      <AgentSupportNote />
    </GateShell>
  );
}

function UnlockForm({ envelope }: { envelope: VaultEnvelope }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const o = await openVault(password, envelope);
      const s = (await unlockVaultSession(o.authPassword)) as {
        error?: { message: string };
      } | null;
      if (s?.error) throw new Error(s.error.message);
      unlockVaultMemory(o.payload, o.key);
    } catch {
      setError("That password did not unlock the workspace.");
    } finally {
      setPending(false);
    }
  };

  return (
    <GateShell>
      <GateCard
        footer={
          <GateTelemetry
            lines={[
              "VAULT_LOCKED // KEY_AUTH_REQUIRED",
              "SYS_VER: 2.4.1 | ENCRYPTION: AES-256-GCM",
            ]}
          />
        }
      >
        <header className="mb-5 flex flex-col items-center text-center md:mb-6">
          <span className="mb-3 flex size-16 items-center justify-center overflow-hidden rounded border border-hairline bg-surface-2 p-1.5">
            <AccountBoxMark className="size-14" alt="" />
          </span>
          <h1 className="text-[26px] font-semibold tracking-tight">AccountBox</h1>
          <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-ink-subtle uppercase">
            secure vault access
          </p>
        </header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="vault-unlock-password"
              className="font-mono text-[10px] tracking-[0.08em] text-ink-subtle uppercase"
            >
              master password
            </label>
            <Input
              id="vault-unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter key…"
              autoFocus
              className="border-hairline bg-surface-2 font-mono text-[13px]"
            />
          </div>
          {error && (
            <p className="font-mono text-[11px] text-label-red">{error}</p>
          )}
          <Button type="submit" className="h-10 w-full font-medium" disabled={pending}>
            {pending ? "Unlocking…" : "Unlock vault"}
          </Button>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
              onClick={() =>
                downloadVaultExport().catch((e) =>
                  setError(e instanceof Error ? e.message : String(e)),
                )
              }
            >
              Export workspace file
            </button>
            {folderShareSupported() && (
              <button
                type="button"
                className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
                onClick={async () => {
                  setError(null);
                  try {
                    await saveVaultToFolder();
                  } catch (err) {
                    if (
                      err instanceof DOMException &&
                      err.name === "AbortError"
                    )
                      return; // user cancelled picker
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                Save to folder…
              </button>
            )}
          </div>
        </form>
      </GateCard>
    </GateShell>
  );
}
