import { afterEach, expect, mock, test } from "bun:test";
import { updateSettings } from "@/hooks/use-settings";
import { saveSnippet, deleteSnippet } from "@/hooks/use-snippets";
import {
  saveSignature,
  removeSignature,
  assignSignature,
} from "@/hooks/use-signatures";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  updateSettings({ demoMode: false });
});

// The core demo guarantee: user-global mutations must never touch the real API
// while recording, or personal snippets/signatures leak (or get overwritten).
test("demo mode routes snippet + signature mutations away from the real API", async () => {
  const fetchMock = mock(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  updateSettings({ demoMode: true });

  await saveSnippet({ trigger: "/hi", text: "<p>hi</p>" });
  await deleteSnippet("demo-intro");
  await saveSignature({ name: "Sig", body: "Best" });
  await assignSignature("test-1", null);
  await removeSignature("demo-sig");

  expect(fetchMock).not.toHaveBeenCalled();
});

test("real mode routes the same mutations to the API", async () => {
  const fetchMock = mock(
    async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  updateSettings({ demoMode: false });

  await saveSnippet({ trigger: "/hi", text: "<p>hi</p>" });
  await assignSignature("acct", "sig");

  expect(fetchMock).toHaveBeenCalled();
});
