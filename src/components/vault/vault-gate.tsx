import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createVaultSession, unlockVaultSession } from "@/lib/auth/auth-client";
import { generateMasterPassword, openVault, prepareNewVault, type VaultEnvelope } from "@/lib/vault/crypto";
import { loadVaultEnvelope, saveVaultEnvelope } from "@/lib/vault/opfs-store";
import { lockVaultMemory, unlockVaultMemory, useVaultState } from "@/lib/vault/store";
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

/** AccountBox mark (fill follows text color, so it themes correctly). */
function AccountBoxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="m15.142 2.818l-2.04 1.13L12 3.311L4.5 7.652v.006L12 12v8.69l7.5-4.343V11.5l2-1.17v7.17L12 23l-9.5-5.5v-11L12 1zm3.387-.499a.507.507 0 0 1 .942 0l.253.612a4.37 4.37 0 0 0 2.25 2.326l.718.32a.53.53 0 0 1 0 .962l-.76.338a4.36 4.36 0 0 0-2.218 2.25l-.247.566a.506.506 0 0 1-.934 0l-.246-.565a4.36 4.36 0 0 0-2.22-2.251l-.76-.338a.53.53 0 0 1 0-.963l.718-.32a4.37 4.37 0 0 0 2.251-2.325z"
      />
    </svg>
  );
}

/** The context the orphaned landing page used to provide, condensed to three
 *  lines beside the setup card on md+ (hidden on phones — the card's own
 *  header caption carries the message there). */
function PitchPanel() {
  return (
    <div className="hidden max-w-[360px] flex-col gap-5 md:flex">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded bg-primary text-on-primary">
          <AccountBoxIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-[18px] font-semibold">AccountBox</h1>
          <p className="font-mono text-[11px] text-ink-subtle">private agent workspace</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3 text-[13px] leading-normal text-ink-subtle">
        <li>
          <strong className="text-ink">A local agent, not a cloud one.</strong>{" "}
          The model runs on this machine's GPU — prompts and plans never leave it.
        </li>
        <li>
          <strong className="text-ink">Your mail stays in Gmail.</strong>{" "}
          Read and sent through the Gmail API; nothing is stored on a server.
        </li>
        <li>
          <strong className="text-ink">The vault is yours.</strong>{" "}
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
    <main className="grid min-h-svh w-full flex-1 place-items-center bg-canvas px-5 text-ink">
      <div className="flex w-full max-w-[820px] items-center justify-center gap-12 md:justify-between">
        <PitchPanel />
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}

export function VaultGate({ children }: { children: ReactNode }) {
  const vault = useVaultState();
  const [envelope, setEnvelope] = useState<VaultEnvelope | null | "loading">("loading");

  useEffect(() => {
    loadVaultEnvelope().then(setEnvelope).catch(() => setEnvelope(null));
  }, []);

  useEffect(() => {
    const onPageHide = () => lockVaultMemory();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  if (vault.status === "unlocked") return <>{children}</>;

  if (envelope === "loading") {
    return <main className="grid min-h-svh w-full flex-1 place-items-center bg-canvas text-ink"><div className="font-mono text-[11px]">loading vault…</div></main>;
  }

  return envelope
    ? <UnlockForm envelope={envelope} />
    : <SetupForm onCreated={() => loadVaultEnvelope().then(setEnvelope)} />;
}

function SetupForm({ onCreated }: { onCreated: () => void }) {
  const isMobile = useIsMobile();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
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
      const s = await createVaultSession(p.authPassword);
      if ((s as any)?.error) throw new Error((s as any).error.message);
      await saveVaultEnvelope(p.envelope);
      unlockVaultMemory(p.payload, p.key);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setPending(false); }
  };

  const generate = () => {
    setError(null);
    setGeneratedPassword(generateMasterPassword());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (generatedPassword) { await create(generatedPassword); return; }
    if (!password && !confirm) { generate(); return; }
    if (password.length < 12 || password !== confirm) { setError("Passwords must match and be >=12 chars"); return; }
    await create(password);
  };

  if (generatedPassword) {
    return (
      <GateShell>
        <div className="w-full rounded border border-hairline bg-surface-1 p-6">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h2 className="text-[20px] font-semibold">Save this recovery key</h2>
              <p className="text-[13px] text-ink-subtle">Unlocks the vault after reload.</p>
            </div>
            <code className="break-all font-mono bg-surface-2 p-2">{generatedPassword}</code>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(generatedPassword)}>Copy</Button>
              <Button type="button" variant="outline" onClick={generate}>Regenerate</Button>
            </div>
            <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Setup Secure Workspace"}</Button>
          </form>
        </div>
      </GateShell>
    );
  }

  return (
    <GateShell>
      <div className="w-full rounded border border-hairline bg-surface-1 p-6">
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <span className="size-9 rounded bg-primary text-on-primary flex items-center justify-center"><AccountBoxIcon className="size-5" /></span>
          <div><h1 className="text-[18px] font-semibold">AccountBox</h1><p className="font-mono text-[11px] text-ink-subtle">private agent workspace</p></div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold">
            {showFields ? "Set a master password" : "Create your vault"}
          </h2>
          <p className="text-[12px] leading-normal text-ink-subtle">
            This creates a vault <strong className="text-ink">in this browser</strong>. It does not follow you to
            other browsers or devices — use the vault file for that.
          </p>
          {showFields ? (
            <>
              <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Master password" autoFocus={!isMobile} />
              <Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm" />
              {error && <p className="text-label-red text-[13px]">{error}</p>}
              <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Setup Secure Workspace"}</Button>
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
              {error && <p className="text-label-red text-[13px]">{error}</p>}
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
              Already have a vault on another browser or device?
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
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
                <span className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink">
                  Import vault file
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
                      if ((err as any)?.name === "AbortError") return; // user cancelled picker
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  Load from folder…
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
      <AgentSupportNote />
    </GateShell>
  );
}

function UnlockForm({ envelope }: { envelope: VaultEnvelope }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string|null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setPending(true);
    try {
      const o = await openVault(password, envelope);
      const s = await unlockVaultSession(o.authPassword);
      if ((s as any)?.error) throw new Error((s as any).error.message);
      unlockVaultMemory(o.payload, o.key);
    } catch { setError("That password did not unlock the vault."); }
    finally { setPending(false); }
  };

  return (
    <main className="grid min-h-svh w-full flex-1 place-items-center bg-canvas px-5 text-ink">
      <div className="w-full max-w-[420px] rounded border border-hairline bg-surface-1 p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold">Unlock vault</h2>
          <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Master password" autoFocus />
          {error && <p className="text-label-red">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Unlocking..." : "Unlock"}</Button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
              onClick={() => downloadVaultExport().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
            >
              Export vault file
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
                    if ((err as any)?.name === "AbortError") return; // user cancelled picker
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                Save to folder…
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
