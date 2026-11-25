// One run of the CronJob: read llmgw's limits, post what crossed a threshold or reset, save state, exit.

import {
  DRY_RUN,
  FETCH_TIMEOUT_MS,
  GCHAT_WEBHOOK_URL,
  LLMGW_URL,
  PROVIDERS,
  STATE_PATH,
  TIME_ZONE,
} from "./config.js";
import { post } from "./gchat.js";
import { fetchLimits } from "./limits.js";
import { log } from "./logger.js";
import { decide } from "./rules.js";
import { loadState, saveState } from "./state.js";

async function main(): Promise<void> {
  if (!DRY_RUN && !GCHAT_WEBHOOK_URL) throw new Error("GCHAT_WEBHOOK_URL is not set");

  const prev = await loadState(STATE_PATH);
  const families = await fetchLimits(LLMGW_URL, Object.keys(PROVIDERS), FETCH_TIMEOUT_MS);
  for (const f of families.filter((f) => !f.known)) {
    log.warn({ event: "limits.unknown", provider: f.provider }, "No current limits; skipped");
  }

  const { messages, next } = decide(prev, families, {
    now: new Date(),
    timeZone: TIME_ZONE,
    names: PROVIDERS,
  });

  // State is saved only after every message is sent: a failed post is retried by the next run.
  for (const message of messages) {
    if (DRY_RUN) {
      process.stdout.write(`---\n${message.text}\n`);
    } else {
      await post(GCHAT_WEBHOOK_URL, message, FETCH_TIMEOUT_MS);
    }
  }
  if (next) await saveState(STATE_PATH, next);

  log.info(
    {
      event: "run.done",
      first_run: prev === null,
      dry_run: DRY_RUN,
      messages: messages.length,
      windows: families.flatMap((f) =>
        f.windows.map((w) => ({ key: w.key, used: w.used, resets_at: w.resetsAt })),
      ),
    },
    "Run finished",
  );
}

main().catch((err: unknown) => {
  log.error({ event: "run.failed", err }, "Run failed");
  process.exitCode = 1;
});
