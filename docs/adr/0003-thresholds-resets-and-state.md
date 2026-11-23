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
- **Thresholds:** 10, 20, … 90 and 99% used. A run posts only the highest one crossed since the last run, and a
  window's threshold never goes down without a reset, so a dip and recovery doesn't alert twice.
- **A reset** is the reset time moving forward by more than an hour, or use dropping by 10 points or more. Reset times
  are never compared exactly.
- **First run:** posts nothing. It records each window's threshold, so the ones already passed are never alerted on.
- **Family with no data** (llmgw `status: "unknown"`): skipped, its state kept as it was.
- **State:** one JSON file on a small `local-path` PVC, written atomically, and saved only after every message of the
  run was posted, so a failed post is retried by the next run. A file that isn't valid state fails the run rather than
  silently starting over.
- **Threads:** a window's messages for one period share a Chat thread, keyed by its reset time to the hour. If Google
  refuses the threaded post with a 400, it's sent once more without a thread (`gchat.thread_refused` in the log): a
  post that kept failing would hold up every alert after it.

## Alternatives considered

- **State in a ConfigMap through the Kubernetes API.** No volume, but needs a ServiceAccount and RBAC for one small file.
- **No state: alert while use sits in a band.** Would repeat every 5 minutes.

## Consequences

- If a post fails after earlier ones in the same run succeeded, the next run posts those earlier ones again. Rare, and
  better than losing an alert.
- Losing the volume loses nothing visible: the next run records the windows again, silently.
