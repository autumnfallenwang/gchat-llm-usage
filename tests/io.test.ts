import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorReason, post } from "../src/gchat.js";
import { loadState, saveState } from "../src/state.js";

describe("Google Chat webhook", () => {
  const webhook = "https://chat.googleapis.com/v1/spaces/SPACE/messages?key=KEY&token=TOKEN";

  function stubFetch(...responses: Response[]) {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return responses.shift() ?? new Response("{}");
    });
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  // Replies in a window's thread hid the 80% alert under a day-old message (2026-11-25).
  it("posts a new message to the webhook as it is, never a reply in a thread", async () => {
    const calls = stubFetch(new Response("{}"));
    await post(webhook, { text: "hi" }, 1000);
    expect(calls).toEqual([{ url: webhook, body: { text: "hi" } }]);
  });

  it("fails on a refused post, once, without retrying", async () => {
    const calls = stubFetch(
      new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "no" } }), {
        status: 400,
      }),
    );
    await expect(post(webhook, { text: "hi" }, 1000)).rejects.toThrow(
      "Google Chat webhook: HTTP 400 (INVALID_ARGUMENT: no)",
    );
    expect(calls).toHaveLength(1);
  });

  it("reports Google's reason for a failure, with any key or token blanked", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Bad thing at ?key=KEY&token=TOKEN",
        },
      }),
      { status: 400 },
    );
    expect(await errorReason(res)).toBe("INVALID_ARGUMENT: Bad thing at ?key=…&token=…");
    expect(await errorReason(new Response("<html>", { status: 502 }))).toBe("");
  });
});

describe("state file", () => {
  it("round-trips, and is null before the first run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gchat-llm-usage-"));
    const path = join(dir, "sub", "state.json");
    expect(await loadState(path)).toBeNull();
    const state = {
      version: 1 as const,
      windows: { "anthropic|all models|weekly": { bucket: 40, used: 45, resets_at: null } },
    };
    await saveState(path, state);
    expect(await loadState(path)).toEqual(state);
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual(state);
  });

  it("refuses a file that isn't version 1 state, rather than starting over", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gchat-llm-usage-"));
    const path = join(dir, "state.json");
    await writeFile(path, '{"windows": {}}');
    await expect(loadState(path)).rejects.toThrow(/version 1/);
  });
});
