# gchat-llm-usage

Posts to a Google Chat space when a Claude or Codex usage window crosses 10%, 20%, … 90% or 95% used, when it hits
the limit (100%), and when it resets.

It's a k3s CronJob on the home cluster. Every 5 minutes it reads
[llmgw](https://github.com/autumnfallenwang/llm-gateway)'s `GET /v1/limits`, compares each window with the last run's
state, posts what's new and exits ([ADR 0002](docs/adr/0002-cronjob-polling-llmgw.md)).

## What it posts

- **First run:** nothing. It records where each window is, so thresholds already passed aren't alerted on.
- **A threshold crossed:** `🟠 *Codex weekly*: 92% used (crossed 90%). 8% left, resets Mon, Jan 7, 11:00 PM EST (in 16h 0m).`
  Only the highest threshold crossed since the last run, and never the same one twice in a period. 🟡 below 80%,
  🟠 80–90%, 🔴 95%.
- **The limit reached:** `⛔ *Codex weekly* limit reached: 100% used. Resets …`
- **A reset:** `🟢 *Codex weekly* reset: 0% used. Next reset …`
- **A window llmgw starts reporting** (say, a 5-hour one after a plan change): `🆕 Now watching …`

Every alert is a new message at the bottom of the space, never a reply in a thread. Which windows exist is read from
llmgw, never assumed ([ADR 0003](docs/adr/0003-thresholds-resets-and-state.md)).

## Develop

Needs Node 26 and pnpm 10.

```sh
pnpm install
pnpm dry-run      # against the live llmgw from arch; prints messages instead of posting, state in ./state.json
pnpm test         # no network needed
pnpm lint
pnpm typecheck
```

## Deploy

Same as the other home apps ([ADR 0001](docs/adr/0001-house-stack.md)): a push to `main` runs the tests, pushes
`ghcr.io/autumnfallenwang/gchat-llm-usage:<sha>` and bumps `apps/gchat-llm-usage.yaml` in arch-infra; Argo CD syncs it to
the `gchat-llm-usage` namespace.

The webhook URL is a Secret made by hand, once ([ADR 0004](docs/adr/0004-webhook-url-as-a-hand-made-secret.md)):

```sh
cp deploy/cluster-secrets.env.example cluster-secrets.env   # then put the real URL in it
bash scripts/create-cluster-secret.sh
```

Common ops:

- `kubectl -n gchat-llm-usage get cronjob,jobs` — recent runs
- `kubectl -n gchat-llm-usage logs job/<name>` — one run's log (or Grafana → Explore → Loki, `service="gchat-llm-usage"`)
- `kubectl -n gchat-llm-usage create job --from=cronjob/gchat-llm-usage run-now` — run once now

| Variable | Default | |
|---|---|---|
| `LLMGW_URL` | `http://llmgw.llmgw.svc.cluster.local` | llmgw's base URL |
| `GCHAT_WEBHOOK_URL` | — | The space's incoming webhook (from the Secret) |
| `STATE_PATH` | `/data/state.json` | The state file, on the CronJob's volume |
| `TIME_ZONE` | `America/New_York` | Zone for reset times in messages |
| `DRY_RUN` | off | `1`: print messages instead of posting |
| `LOG_LEVEL` | `info` | pino level |
