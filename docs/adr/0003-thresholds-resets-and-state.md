# 0003: Thresholds, resets and a state file

- **Status:** accepted
- **Date:** 2026-11-23

## Context

Each run must post only what's new: a threshold crossed since the last run, or a reset. That needs memory between runs.
The windows themselves vary by plan (Claude's weekly all-models and Fable windows; a Codex plan may add a 5-hour one),
and llmgw's reset times jitter by fractions of a second between fetches (`…10:00:00.075Z`, then `…10:00:00.993Z`).

## Decision

- **Windows are read, never assumed.** Each is keyed `provider|scope|period`. A window that appears gets a "now
  watching" message; one that's gone is dropped from state.
- **Thresholds:** 10, 20, … 90, 95 and 100% used. A run posts only the highest one crossed since the last run, and a
  window's threshold never goes down without a reset, so a dip and recovery doesn't alert twice.
- **Why 95 and 100, not 99:** at a heavy day's pace (about 2% of a weekly window an hour), 95% leaves a couple of hours
  to finish a task or move to the other model; 99% leaves minutes, often lands in the same 5-minute poll as 100%, and
  Codex reports whole numbers. 100% (⛔ limit reached) says you're cut off and until when; with 99% on top it could
  never fire.
- **A reset** is the reset time moving forward by more than an hour, or use dropping by 10 points or more. Reset times
  are never compared exactly.
- **First run:** posts nothing. It records each window's threshold, so the ones already passed are never alerted on.
- **Family with no data** (llmgw `status: "unknown"`): skipped, its state kept as it was.
- **State:** one JSON file on a small `local-path` PVC, written atomically, and saved only after every message of the
  run was posted, so a failed post is retried by the next run. A file that isn't valid state fails the run rather than
  silently starting over.
- **Every alert is a new message, never a reply.** Until 2026-11-25 a window's alerts for one period shared a Chat
  thread, so only the first showed up as a new message: Claude's 80% alert went in as a reply under the day-old 70%
  one and was missed. The later alerts are the ones that matter most, and there are only a few a week.

## Alternatives considered

- **State in a ConfigMap through the Kubernetes API.** No volume, but needs a ServiceAccount and RBAC for one small file.
- **No state: alert while use sits in a band.** Would repeat every 5 minutes.
- **A thread per window per period.** Tidier, but it hid every alert after the first (see above).

## Consequences

- If a post fails after earlier ones in the same run succeeded, the next run posts those earlier ones again. Rare, and
  better than losing an alert.
- Losing the volume loses nothing visible: the next run records the windows again, silently.
