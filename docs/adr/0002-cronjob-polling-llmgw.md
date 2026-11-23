# 0002: A CronJob polling llmgw every 5 minutes

- **Status:** accepted
- **Date:** 2026-11-23

## Context

Claude and Codex usage windows should reach a Google Chat space as they fill up and reset. llmgw already reads every
paid family's usage endpoint and serves it, in one format, at `GET /v1/limits`, cached for 60 s. Neither provider pushes
anything, so something has to poll.

## Decision

- **Poll llmgw, not the providers.** One unauthenticated in-cluster call (the family list, no `?model=`) gives every
  window; llmgw owns the credentials and the parsing.
- **A k3s CronJob, every 5 minutes.** `concurrencyPolicy: Forbid`, no retries (`backoffLimit: 0`), and a run missed by
  more than 4 minutes is skipped. A weekly window moving in 10% steps doesn't need finer polling, and each run costs at
  most one usage-endpoint call per family.
- **If llmgw fails, the run fails.** It logs `run.failed` and exits 1; nothing is posted and no state changes, so the
  next run picks up where this one would have.

## Alternatives considered

- **A systemd timer on arch.** The cluster is a single node on arch, so it would run on the same machine with no
  reliability gain, outside GitOps and Loki, and reaching llmgw only through the `/etc/hosts` entry. If k3s is down,
  llmgw is too, so there'd be nothing to poll anyway.
- **A long-running Deployment with a sleep loop.** Works, but idles between runs, and a CronJob's job history shows each
  run's outcome for free.
- **Calling the providers' usage endpoints directly.** Duplicates llmgw's credential handling and parsing; the
  endpoints are undocumented and change.

## Consequences

- An alert can arrive up to about 5 minutes after the threshold is crossed.
- Use from llmgw's limits is account-wide: it includes Claude Code and Codex use outside the gateway.
