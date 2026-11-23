import { describe, expect, it } from "vitest";
import type { Family, Window } from "../src/limits.js";
import { bucketOf, decide, type Format, type State, threadKey } from "../src/rules.js";

const fmt: Format = {
  now: new Date("2030-01-07T12:00:00Z"),
  timeZone: "America/New_York",
  names: { anthropic: "Claude", "openai-codex": "Codex" },
};

const CLAUDE_RESET = "2030-01-10T10:00:00.075Z";
const CODEX_RESET = "2030-01-08T04:00:00.000Z";

function win(
  provider: string,
  scope: string,
  period: string,
  used: number,
  resetsAt: string | null,
): Window {
  return { key: `${provider}|${scope}|${period}`, provider, scope, period, used, resetsAt };
}

function families(
  claude: number,
  fable: number,
  codex: number,
  codexReset = CODEX_RESET,
): Family[] {
  return [
    {
      provider: "anthropic",
      known: true,
      windows: [
        win("anthropic", "all models", "weekly", claude, CLAUDE_RESET),
        win("anthropic", "Fable", "weekly", fable, CLAUDE_RESET),
      ],
    },
    {
      provider: "openai-codex",
      known: true,
      windows: [win("openai-codex", "all models", "weekly", codex, codexReset)],
    },
  ];
}

/** Space-normalized, since Intl puts a narrow no-break space before AM/PM. */
const texts = (r: { messages: { text: string }[] }) =>
  r.messages.map((m) => m.text.replace(/\s/g, " "));

function stateAfter(...runs: Family[][]): State {
  let state: State | null = null;
  for (const run of runs) state = decide(state, run, fmt).next;
  if (!state) throw new Error("no state");
  return state;
}

describe("bucketOf", () => {
  it("is the highest threshold reached", () => {
    expect([0, 9.9, 10, 45, 96, 99, 100].map(bucketOf)).toEqual([0, 0, 10, 40, 90, 99, 99]);
  });
});

describe("decide", () => {
  it("posts one summary on the first run, not an alert for every threshold already passed", () => {
    const r = decide(null, families(45, 12.5, 85), fmt);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.threadKey).toBeNull();
    expect(texts(r)[0]).toBe(
      [
        "👀 Watching Claude and Codex usage. Alerts at 10%, 20%, … 90% and 99% used, and when a window resets.",
        "• *Claude weekly*: 45% used, resets Thu, Jan 10, 5:00 AM EST (in 2d 22h)",
        "• *Claude weekly (Fable)*: 12.5% used, resets Thu, Jan 10, 5:00 AM EST (in 2d 22h)",
        "• *Codex weekly*: 85% used, resets Mon, Jan 7, 11:00 PM EST (in 16h 0m)",
      ].join(" "),
    );
    expect(r.next?.windows["openai-codex|all models|weekly"]?.bucket).toBe(80);
    expect(r.next?.windows["anthropic|Fable|weekly"]?.bucket).toBe(10);
  });

  it("saves nothing on a first run with no data, so the next run is still the first", () => {
    const r = decide(null, [{ provider: "anthropic", known: false, windows: [] }], fmt);
    expect(r).toEqual({ messages: [], next: null });
  });

  it("posts nothing when no window crossed a threshold", () => {
    const state = stateAfter(families(45, 12.5, 85));
    expect(decide(state, families(48, 13, 88), fmt).messages).toEqual([]);
  });

  it("posts once per threshold crossed, in the window's thread", () => {
    const state = stateAfter(families(45, 12.5, 85));
    const r = decide(state, families(45, 12.5, 92), fmt);
    expect(texts(r)).toEqual([
      "🟠 *Codex weekly*: 92% used (crossed 90%). 8% left, resets Mon, Jan 7, 11:00 PM EST (in 16h 0m).",
    ]);
    expect(r.messages[0]?.threadKey).toBe("openai-codex-all-models-weekly-2030-01-08t04");
    expect(decide(r.next, families(45, 12.5, 93), fmt).messages).toEqual([]);
  });

  it("names only the highest threshold when several were crossed between runs", () => {
    const state = stateAfter(families(45, 12.5, 85));
    expect(texts(decide(state, families(72, 12.5, 85), fmt))).toEqual([
      "🟡 *Claude weekly*: 72% used (crossed 70%). 28% left, resets Thu, Jan 10, 5:00 AM EST (in 2d 22h).",
    ]);
  });

  it("marks 99% and 100% red", () => {
    const state = stateAfter(families(45, 12.5, 85));
    expect(texts(decide(state, families(45, 12.5, 99.4), fmt))[0]).toMatch(
      /^🔴 \*Codex weekly\*: 99\.4% used \(crossed 99%\)\. 0\.6% left/,
    );
    expect(texts(decide(state, families(45, 12.5, 100), fmt))).toEqual([
      "🔴 *Codex weekly* limit reached: 100% used. Resets Mon, Jan 7, 11:00 PM EST (in 16h 0m).",
    ]);
  });

  it("doesn't alert again when use dips below a threshold and comes back", () => {
    const state = stateAfter(
      families(45, 12.5, 85),
      families(45, 12.5, 92),
      families(45, 12.5, 88),
    );
    expect(state.windows["openai-codex|all models|weekly"]?.bucket).toBe(90);
    expect(decide(state, families(45, 12.5, 91), fmt).messages).toEqual([]);
  });

  it("posts a reset when the reset time moves on, in the new period's thread", () => {
    const state = stateAfter(families(45, 12.5, 96));
    const r = decide(state, families(45, 12.5, 0, "2030-01-15T04:00:00.000Z"), fmt);
    expect(texts(r)).toEqual([
      "🟢 *Codex weekly* reset: 0% used. Next reset Mon, Jan 14, 11:00 PM EST (in 7d 16h).",
    ]);
    expect(r.messages[0]?.threadKey).toBe("openai-codex-all-models-weekly-2030-01-15t04");
    expect(r.next?.windows["openai-codex|all models|weekly"]?.bucket).toBe(0);
    // The new period alerts from 10% again.
    expect(
      texts(decide(r.next, families(45, 12.5, 11, "2030-01-15T04:00:00.000Z"), fmt))[0],
    ).toMatch(/crossed 10%/);
  });

  it("posts a reset when use drops sharply, even if the reset time didn't move", () => {
    const state = stateAfter(families(45, 12.5, 85));
    expect(texts(decide(state, families(45, 12.5, 2), fmt))[0]).toMatch(
      /^🟢 \*Codex weekly\* reset: 2% used/,
    );
  });

  it("isn't fooled by the reset time's sub-second jitter", () => {
    const state = stateAfter(families(45, 12.5, 85));
    const jittered = families(45, 12.5, 85).map((f) => ({
      ...f,
      windows: f.windows.map((w) => ({
        ...w,
        resetsAt: w.resetsAt?.replace(".075Z", ".993Z") ?? null,
      })),
    }));
    expect(decide(state, jittered, fmt).messages).toEqual([]);
    expect(threadKey(jittered[0]!.windows[0]!)).toBe(
      threadKey(families(45, 12.5, 85)[0]!.windows[0]!),
    );
  });

  it("leaves a family's state alone while llmgw has no data for it", () => {
    const state = stateAfter(families(45, 12.5, 85));
    const r = decide(
      state,
      [families(45, 12.5, 85)[0]!, { provider: "openai-codex", known: false, windows: [] }],
      fmt,
    );
    expect(r.messages).toEqual([]);
    expect(r.next?.windows["openai-codex|all models|weekly"]).toEqual(
      state.windows["openai-codex|all models|weekly"],
    );
  });

  it("announces a window that appears, and forgets one that's gone", () => {
    const state = stateAfter(families(45, 12.5, 85));
    const withFiveHour = families(45, 12.5, 85);
    withFiveHour[1]!.windows.push(
      win("openai-codex", "all models", "5h", 30, "2030-01-07T15:00:00Z"),
    );
    const added = decide(state, withFiveHour, fmt);
    expect(texts(added)).toEqual([
      "🆕 Now watching *Codex 5-hour*: 30% used, resets Mon, Jan 7, 10:00 AM EST (in 3h 0m).",
    ]);
    const removed = decide(added.next, families(45, 12.5, 85), fmt);
    expect(removed.messages).toEqual([]);
    expect(Object.keys(removed.next?.windows ?? {})).not.toContain("openai-codex|all models|5h");
  });
});
