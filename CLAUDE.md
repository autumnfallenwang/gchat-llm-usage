# gchat-llm-usage

## Stay inside this repo

Only change what belongs to this repo. Don't update anything outside it, such as llm-gateway, arch-infra, other
repos, the cluster or this machine's config, unless the user asks for that specific change. Reading and read-only checks
outside the repo are fine.

If work here needs a change outside, say so and wait. For example, changing the webhook means re-running
`scripts/create-cluster-secret.sh` against the cluster, so ask first.

## Never commit the webhook URL

The repo is public. The Google Chat webhook URL lives only in the cluster Secret and the gitignored
`cluster-secrets.env` (ADR 0004). Fixtures and docs use made-up numbers, not this account's usage or plans.
