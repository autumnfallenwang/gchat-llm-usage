// Reads llmgw's GET /v1/limits (the family list, account-wide) into the windows this app watches.
// The format is llmgw's: docs/usage-limits.md and src/schemas/limits.ts in llm-gateway.

/** One usage window of one family, as llmgw reports it. */
export interface Window {
  /** `provider|scope|period`: stable across runs, so state can be keyed by it. */
  key: string;
  /** llmgw's `provider` (`owned_by`), e.g. `anthropic`, `openai-codex`. */
  provider: string;
  /** `all models`, or the family a scoped limit covers (e.g. `Fable`). */
  scope: string;
  /** `5h`, `daily`, `weekly`, `monthly`, or a length like `12h`. */
  period: string;
  /** Share of the allowance used, 0–100. */
  used: number;
  /** When the window resets (ISO 8601), if llmgw knows. */
  resetsAt: string | null;
}

/** A watched family: its windows, or `known: false` when llmgw has no current data for it. */
export interface Family {
  provider: string;
  known: boolean;
  windows: Window[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The watched families from a `/v1/limits` list response. A family whose `status` is `unknown`
 * (no data yet, or stale) is `known: false`: its windows can't be trusted, so it's skipped, not
 * read as "no windows".
 */
export function parseLimits(json: unknown, providers: string[]): Family[] {
  if (!isObject(json) || !Array.isArray(json.data)) {
    throw new Error("llmgw /v1/limits: expected { data: [...] }");
  }
  const families: Family[] = [];
  for (const entry of json.data) {
    if (!isObject(entry) || typeof entry.provider !== "string") continue;
    const provider = entry.provider;
    if (!providers.includes(provider)) continue;
    if (entry.status === "unknown" || !Array.isArray(entry.windows)) {
      families.push({ provider, known: false, windows: [] });
      continue;
    }
    const windows: Window[] = [];
    for (const w of entry.windows) {
      if (!isObject(w)) continue;
      const { scope, period, used_percent, resets_at } = w;
      if (typeof scope !== "string" || typeof period !== "string") continue;
      if (typeof used_percent !== "number" || !Number.isFinite(used_percent)) continue;
      windows.push({
        key: `${provider}|${scope}|${period}`,
        provider,
        scope,
        period,
        used: used_percent,
        resetsAt: typeof resets_at === "string" ? resets_at : null,
      });
    }
    families.push({ provider, known: true, windows });
  }
  return families;
}

export async function fetchLimits(
  baseUrl: string,
  providers: string[],
  timeoutMs: number,
): Promise<Family[]> {
  const res = await fetch(`${baseUrl}/v1/limits`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`llmgw /v1/limits: HTTP ${res.status}`);
  return parseLimits(await res.json(), providers);
}
