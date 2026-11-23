import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")) as {
  version: string;
};

export const APP_NAME = "gchat-llm-usage";
export const APP_VERSION: string = pkg.version;
/** The commit the image was built from (CI passes it as a build arg); null in dev. */
export const APP_COMMIT: string | null = env.APP_COMMIT || null;

export const LOG_LEVEL = env.LOG_LEVEL ?? "info";

export const LLMGW_URL = (env.LLMGW_URL ?? "http://llmgw.llmgw.svc.cluster.local").replace(
  /\/$/,
  "",
);
/** The space's incoming webhook. A credential: anyone with it can post there (ADR 0004). */
export const GCHAT_WEBHOOK_URL = env.GCHAT_WEBHOOK_URL ?? "";
/** Print the messages instead of posting them. */
export const DRY_RUN = env.DRY_RUN === "1" || env.DRY_RUN === "true";
/** Which windows were last alerted on, so a run only posts what's new (ADR 0003). */
export const STATE_PATH = env.STATE_PATH ?? "/data/state.json";
/** Reset times in messages are shown in this zone. */
export const TIME_ZONE = env.TIME_ZONE ?? "America/New_York";
export const FETCH_TIMEOUT_MS = Number(env.FETCH_TIMEOUT_MS ?? 15000);

/** The llmgw families watched, by `provider` (llmgw's `owned_by`), with the name used in messages. */
export const PROVIDERS: Record<string, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
};
