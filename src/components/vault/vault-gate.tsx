import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MailIcon } from "lucide-react";
import { createVaultSession, unlockVaultSession } from "@/lib/auth/auth-client";
import { generateMasterPassword, openVault, prepareNewVault, type VaultEnvelope } from "@/lib/vault/crypto";
import { loadVaultEnvelope, saveVaultEnvelope } from "@/lib/vault/opfs-store";
import { lockVaultMemory, unlockVaultMemory, useVaultState } from "@/lib/vault/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    return <main className="grid min-h-svh place-items-center bg-canvas text-ink"><div className="font-mono text-[11px]">loading vault…</div></main>;
  }

  return envelope
    ? <UnlockForm envelope={envelope} />
    : <SetupForm onCreated={() => loadVaultEnvelope().then(setEnvelope)} />;
}

function SetupForm({ onCreated }: { onCreated: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (generatedPassword) { await create(generatedPassword); return; }
    if (!password && !confirm) { const g = generateMasterPassword(); setGeneratedPassword(g); return; }
    if (password.length < 12 || password !== confirm) { setError("Passwords must match and be >=12 chars"); return; }
    await create(password);
  };

  if (generatedPassword) {
    return (
      <main className="grid min-h-svh place-items-center bg-canvas px-5 text-ink">
        <div className="w-full max-w-[420px] rounded border border-hairline bg-surface-1 p-6">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h2 className="text-[20px] font-semibold">Save this recovery key</h2>
              <p className="text-[13px] text-ink-subtle">Unlocks the vault after reload.</p>
            </div>
            <code className="break-all font-mono bg-surface-2 p-2">{generatedPassword}</code>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(generatedPassword)}>Copy</Button>
              <Button type="button" variant="outline" onClick={() => { const g = generateMasterPassword(); setGeneratedPassword(g); }}>Regenerate</Button>
            </div>
            <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create vault & continue"}</Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center bg-canvas px-5 text-ink">
      <div className="w-full max-w-[420px] rounded border border-hairline bg-surface-1 p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="size-9 rounded bg-primary text-on-primary flex items-center justify-center"><MailIcon className="size-5" /></span>
          <div><h1 className="text-[18px] font-semibold">BetterBox</h1><p className="font-mono text-[11px] text-ink-subtle">local vault</p></div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold">Set a master password</h2>
          <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Master password" autoFocus />
          <Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm" />
          {error && <p className="text-label-red text-[13px]">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create vault & continue"}</Button>
        </form>
      </div>
    </main>
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
    <main className="grid min-h-svh place-items-center bg-canvas px-5 text-ink">
      <div className="w-full max-w-[420px] rounded border border-hairline bg-surface-1 p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold">Unlock vault</h2>
          <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Master password" autoFocus />
          {error && <p className="text-label-red">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Unlocking..." : "Unlock"}</Button>
        </form>
      </div>
    </main>
  );
}
