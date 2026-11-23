import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { body, errorReason, postUrl } from "../src/gchat.js";
import { loadState, saveState } from "../src/state.js";

describe("Google Chat webhook", () => {
  const webhook = "https://chat.googleapis.com/v1/spaces/SPACE/messages?key=KEY&token=TOKEN";

  it("keeps the URL's key and token and asks for replies in the thread", () => {
    const url = new URL(postUrl(webhook, { text: "hi", threadKey: "k" }));
    expect(url.pathname).toBe("/v1/spaces/SPACE/messages");
    expect(url.searchParams.get("key")).toBe("KEY");
    expect(url.searchParams.get("token")).toBe("TOKEN");
    expect(url.searchParams.get("messageReplyOption")).toBe("REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
  });

  // Google answers a reply option with no thread key with a 400 (seen on the first cluster run).
  it("leaves the reply option off a message with no thread", () => {
    const url = new URL(postUrl(webhook, { text: "hi", threadKey: null }));
    expect(url.searchParams.has("messageReplyOption")).toBe(false);
    expect(url.searchParams.get("token")).toBe("TOKEN");
  });

  it("sends a thread key only when the message has one", () => {
    expect(body({ text: "hi", threadKey: "k" })).toEqual({
      text: "hi",
      thread: { threadKey: "k" },
    });
    expect(body({ text: "hi", threadKey: null })).toEqual({ text: "hi" });
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
