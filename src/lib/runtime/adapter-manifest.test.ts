import { afterEach, describe, expect, test } from "bun:test";
import { fetchAdapterManifest } from "./adapter-manifest";

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = ((input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input)))) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchAdapterManifest", () => {
  test("reads adapter.json beside the weights", async () => {
    let requested = "";
    mockFetch((url) => {
      requested = url;
      return Response.json({
        skillId: "gmail-agent",
        version: "v1",
        systemPromptSha256: "abc",
      });
    });
    const m = await fetchAdapterManifest("/adapters/gmail-agent/");
    expect(requested).toBe("/adapters/gmail-agent/adapter.json");
    expect(m?.skillId).toBe("gmail-agent");
    expect(m?.version).toBe("v1");
  });

  test("404 (pre-manifest adapter) is null, not an error", async () => {
    mockFetch(() => new Response("not found", { status: 404 }));
    expect(await fetchAdapterManifest("/adapters/gmail-agent")).toBeNull();
  });

  test("junk documents are null — identity must be well-formed", async () => {
    mockFetch(() => Response.json({ version: 2 }));
    expect(await fetchAdapterManifest("/adapters/gmail-agent")).toBeNull();
    mockFetch(() => new Response("<html>", { status: 200 }));
    expect(await fetchAdapterManifest("/adapters/gmail-agent")).toBeNull();
  });

  test("network failure is null — equip must never fail on the manifest", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await fetchAdapterManifest("/adapters/gmail-agent")).toBeNull();
  });
});
