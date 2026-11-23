// What to post, given the last run's state and llmgw's windows now. Pure: no I/O (ADR 0003).

import type { Family, Window } from "./limits.js";

/**
 * Alert when a window's use crosses one of these, upward. A reset is the "0%" alert. 95% is the
 * last warning with time left to act; 100% is the limit reached (ADR 0003).
 */
export const THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

/** A drop this large in percent used is a reset, even if the reset time didn't move. */
const RESET_DROP = 10;
/**
 * The reset time moving forward by more than this is a reset. llmgw's reset times jitter by
 * fractions of a second between fetches (Claude's `…10:00:00.075Z`, then `…10:00:00.993Z`), so
 * they're never compared exactly.
 */
const RESET_MOVE_MS = 60 * 60 * 1000;

export interface WindowState {
  /** The highest threshold already alerted on in this window's current period (0: none). */
  bucket: number;
  used: number;
  resets_at: string | null;
}

export interface State {
  version: 1;
  /** By `Window.key`. */
  windows: Record<string, WindowState>;
}

export interface Message {
  text: string;
  /** Messages with the same key go in one Chat thread; null starts a thread of its own. */
  threadKey: string | null;
}

export interface Format {
  now: Date;
  timeZone: string;
  /** Display names by provider (`anthropic` → `Claude`). */
  names: Record<string, string>;
}

export function bucketOf(used: number): number {
  let bucket = 0;
  for (const t of THRESHOLDS) if (used >= t) bucket = t;
  return bucket;
}

export function isReset(before: WindowState, now: Window): boolean {
  if (now.used + RESET_DROP <= before.used) return true;
  const a = before.resets_at ? Date.parse(before.resets_at) : Number.NaN;
  const b = now.resetsAt ? Date.parse(now.resetsAt) : Number.NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b - a > RESET_MOVE_MS;
}

/**
 * The messages to post and the state to save. A first run posts nothing: it only records where
 * each window is, so thresholds already passed aren't alerted on. `next` is null when there's
 * nothing to save yet (a first run that found no data), so the next run still counts as the first.
 */
export function decide(
  prev: State | null,
  families: Family[],
  fmt: Format,
): { messages: Message[]; next: State | null } {
  const first = prev === null;
  const next: State = { version: 1, windows: { ...prev?.windows } };
  const messages: Message[] = [];

  for (const family of families) {
    // No current data: leave its state alone, so the next good run compares with the last one.
    if (!family.known) continue;
    for (const key of Object.keys(next.windows)) {
      if (key.startsWith(`${family.provider}|`) && !family.windows.some((w) => w.key === key)) {
        delete next.windows[key];
      }
    }
    for (const w of family.windows) {
      const before = prev?.windows[w.key];
      const after: WindowState = { bucket: bucketOf(w.used), used: w.used, resets_at: w.resetsAt };
      if (!before) {
        // A window not seen before is announced, except on the first run, which only records.
        if (!first) messages.push(newWindow(w, fmt));
      } else if (isReset(before, w)) messages.push(reset(w, fmt));
      else if (after.bucket > before.bucket) messages.push(crossed(w, after.bucket, fmt));
      // Use can dip a little without a reset; don't alert on the same threshold twice.
      else after.bucket = Math.max(after.bucket, before.bucket);
      next.windows[w.key] = after;
    }
  }

  if (first && Object.keys(next.windows).length === 0) return { messages: [], next: null };
  return { messages, next };
}

// ── Message text (Google Chat: *bold*) ─────────────────────────────────────────

function label(w: Window, fmt: Format): string {
  const name = fmt.names[w.provider] ?? w.provider;
  const period = w.period === "5h" ? "5-hour" : w.period;
  return `${name} ${period}${w.scope === "all models" ? "" : ` (${w.scope})`}`;
}

function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

function relative(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `in ${days}d ${hours % 24}h` : `in ${days}d`;
}

export function when(resetsAt: string | null, fmt: Format): string {
  const t = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  if (!Number.isFinite(t)) return "reset time unknown";
  const at = new Intl.DateTimeFormat("en-US", {
    timeZone: fmt.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(t));
  return `${at} (${relative(t - fmt.now.getTime())})`;
}

/** One thread per window per period, keyed by the period's reset time to the hour. */
export function threadKey(w: Window): string | null {
  const t = w.resetsAt ? Date.parse(w.resetsAt) : Number.NaN;
  if (!Number.isFinite(t)) return null;
  const hour = new Date(Math.round(t / 3_600_000) * 3_600_000).toISOString().slice(0, 13);
  return `${w.provider}-${w.scope}-${w.period}-${hour}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function crossed(w: Window, bucket: number, fmt: Format): Message {
  const left = Math.max(0, 100 - w.used);
  let text: string;
  if (w.used >= 100) {
    text = `⛔ *${label(w, fmt)}* limit reached: ${pct(w.used)} used. Resets ${when(w.resetsAt, fmt)}.`;
  } else {
    const icon = bucket >= 95 ? "🔴" : bucket >= 80 ? "🟠" : "🟡";
    text = `${icon} *${label(w, fmt)}*: ${pct(w.used)} used (crossed ${bucket}%). ${pct(left)} left, resets ${when(w.resetsAt, fmt)}.`;
  }
  return { text, threadKey: threadKey(w) };
}

function reset(w: Window, fmt: Format): Message {
  return {
    text: `🟢 *${label(w, fmt)}* reset: ${pct(w.used)} used. Next reset ${when(w.resetsAt, fmt)}.`,
    threadKey: threadKey(w),
  };
}

function newWindow(w: Window, fmt: Format): Message {
  return {
    text: `🆕 Now watching *${label(w, fmt)}*: ${pct(w.used)} used, resets ${when(w.resetsAt, fmt)}.`,
    threadKey: threadKey(w),
  };
}
