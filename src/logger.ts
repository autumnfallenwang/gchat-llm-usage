// The house log contract, the same across the home apps so one Loki query works for all of them:
//
//   log.info({ event, ... }, "static message")
//
// One JSON object per line on stdout. The message is static: anything that varies goes in a field.

import { pino } from "pino";
import { APP_COMMIT, APP_NAME, APP_VERSION, LOG_LEVEL } from "./config.js";

export const log = pino({
  level: LOG_LEVEL,
  base: { service: APP_NAME, version: APP_VERSION, commit: APP_COMMIT },
  timestamp: pino.stdTimeFunctions.isoTime,
});
