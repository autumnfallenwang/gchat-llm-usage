# 0004: The webhook URL is a Secret made by hand

- **Status:** accepted
- **Date:** 2026-11-23

## Context

A Google Chat incoming webhook URL carries its own `key` and `token`: anyone with it can post to the space. This repo
and arch-infra are public. Sealed Secrets is named in arch-infra's README but not installed on the cluster.

## Decision

The URL lives only in the `gchat-llm-usage-secrets` Secret (key `GCHAT_WEBHOOK_URL`), created once by
`scripts/create-cluster-secret.sh` from a gitignored `cluster-secrets.env`, the way homestorm makes its secrets. The
chart only references it. Errors from posting name the HTTP status, never the URL.

## Alternatives considered

- **Sealed Secrets.** The right end state for every app, but it isn't installed, and installing it is a cluster change
  of its own.
- **The URL in `values.yaml`.** It would be public.

## Consequences

- A rebuilt cluster needs the script run again before the first job can start.
- Rotating the webhook means a new URL in `cluster-secrets.env` and re-running the script; no deploy.
