# 0001: Same stack and deployment as the other home apps, minus what a script doesn't need

- **Status:** accepted
- **Date:** 2026-11-23

## Context

gchat-llm-usage joins llmgw, mcpgw, homestorm and the other home apps on the k3s cluster. They share one stack and one
deployment model, kept in one person's head. This app is far smaller: one script that runs and exits.

## Decision

- **Same:** TypeScript on Node 26, pnpm, one package; Vitest, Biome, `tsc --noEmit`; pino JSON logs in the house shape,
  into Loki; an image on GHCR, a Helm chart at `deploy/chart`, GitOps through arch-infra and Argo CD, its own namespace;
  README, CLAUDE.md and ADRs.
- **Left out:** no server (no Hono, Service, Ingress or probes), no Zod (the few fields read from llmgw are checked by
  hand), no change-detection job in CI (redeploying a CronJob interrupts nothing), no plan or progress docs.
- **Dependencies:** `pino` and `tsx` only. Node's own `fetch` calls llmgw and the webhook.

## Alternatives considered

- **A shell script with curl and jq.** Smaller still, but the threshold and reset logic wants unit tests, and it would
  be the only app on the cluster built differently.

## Consequences

- Deploy files, CI and ops commands carry over from mcpgw nearly unchanged.
