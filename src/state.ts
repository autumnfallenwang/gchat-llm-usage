// The state file on the CronJob's volume: which threshold each window was last alerted on.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { State } from "./rules.js";

/**
 * The saved state, or null when there's none yet. A file that isn't valid state fails the run
 * rather than starting over, which would post the "now watching" summary again every 5 minutes.
 */
export async function loadState(path: string): Promise<State | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const json = JSON.parse(raw) as Partial<State>;
  if (json?.version !== 1 || typeof json.windows !== "object" || json.windows === null) {
    throw new Error(`${path}: not a version 1 state file`);
  }
  return json as State;
}

/** Written to a temporary file and renamed, so a run killed mid-write can't leave half a file. */
export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, path);
}
