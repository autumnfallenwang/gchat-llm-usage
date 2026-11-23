import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLimits } from "../src/limits.js";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "limits.json"), "utf-8"),
) as { data: Record<string, unknown>[] };
const WATCHED = ["anthropic", "openai-codex"];

describe("parseLimits", () => {
  it("reads the watched families' windows from llmgw's list", () => {
    const families = parseLimits(fixture, WATCHED);
    expect(families.map((f) => f.provider)).toEqual(["anthropic", "openai-codex"]);
    expect(families[0]?.windows).toEqual([
      {
        key: "anthropic|all models|weekly",
        provider: "anthropic",
        scope: "all models",
        period: "weekly",
        used: 45,
        resetsAt: "2030-01-10T10:00:00.075Z",
      },
      {
        key: "anthropic|Fable|weekly",
        provider: "anthropic",
        scope: "Fable",
        period: "weekly",
        used: 12.5,
        resetsAt: "2030-01-10T10:00:00.075Z",
      },
    ]);
    expect(families[1]?.windows.map((w) => [w.key, w.used])).toEqual([
      ["openai-codex|all models|weekly", 85],
    ]);
  });

  it("marks a family with status unknown as not known, rather than as having no windows", () => {
    const json = {
      data: fixture.data.map((e) =>
        e.provider === "openai-codex" ? { ...e, status: "unknown", windows: [] } : e,
      ),
    };
    const codex = parseLimits(json, WATCHED).find((f) => f.provider === "openai-codex");
    expect(codex).toEqual({ provider: "openai-codex", known: false, windows: [] });
  });

  it("skips malformed windows and refuses a response that isn't a list", () => {
    const json = {
      data: [
        {
          provider: "anthropic",
          status: "ok",
          windows: [
            { scope: "all models", period: "weekly", used_percent: "45" },
            null,
            { scope: "all models", period: "5h", used_percent: 3, resets_at: null },
          ],
        },
      ],
    };
    expect(parseLimits(json, WATCHED)[0]?.windows.map((w) => [w.period, w.resetsAt])).toEqual([
      ["5h", null],
    ]);
    expect(() => parseLimits({ error: { code: "x" } }, WATCHED)).toThrow(/expected/);
  });
});
