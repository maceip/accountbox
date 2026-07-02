import { useSyncExternalStore } from "react";
import type { VaultPayload } from "./crypto";

type VaultState =
  | { status: "locked"; payload: null; key: null }
  | { status: "unlocked"; payload: VaultPayload; key: CryptoKey };

let state: VaultState = { status: "locked", payload: null, key: null };
const listeners = new Set<() => void>();

export function unlockVaultMemory(payload: VaultPayload, key: CryptoKey) {
  state = { status: "unlocked", payload, key };
  emit();
}

export function lockVaultMemory() {
  state = { status: "locked", payload: null, key: null };
  emit();
}

export function getVaultState() {
  return state;
}

export function useVaultState() {
  return useSyncExternalStore(subscribe, getVaultState, getVaultState);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}
