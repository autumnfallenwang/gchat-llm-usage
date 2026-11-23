#!/usr/bin/env bash
# Create the gchat-llm-usage-secrets Secret in the cluster from a local env file (ADR 0004).
#
# Usage:
#   1. cp deploy/cluster-secrets.env.example cluster-secrets.env
#   2. edit cluster-secrets.env with the real webhook URL (NEVER commit it)
#   3. bash scripts/create-cluster-secret.sh
#
# Key required (matches the secretKeyRef in deploy/chart/templates/cronjob.yaml):
#   GCHAT_WEBHOOK_URL  the Google Chat space's incoming webhook

set -euo pipefail

NAMESPACE="${GCHAT_LLM_USAGE_NS:-gchat-llm-usage}"
SECRET_NAME="${GCHAT_LLM_USAGE_SECRET_NAME:-gchat-llm-usage-secrets}"
ENV_FILE="${GCHAT_LLM_USAGE_SECRET_ENV:-./cluster-secrets.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy deploy/cluster-secrets.env.example and edit." >&2
  exit 1
fi

# `apply` replaces the Secret with exactly the keys in the file, so refuse a file missing one.
for key in GCHAT_WEBHOOK_URL; do
  if ! grep -qE "^${key}=https://chat\.googleapis\.com/.+" "$ENV_FILE"; then
    echo "ERROR: $ENV_FILE has no Google Chat webhook URL for $key." >&2
    exit 1
  fi
done

# Argo CD also creates the namespace (CreateNamespace=true), but this may run first.
kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

kubectl create secret generic "$SECRET_NAME" \
  --namespace="$NAMESPACE" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "Created/updated $NAMESPACE/$SECRET_NAME with keys:"
kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o jsonpath='{.data}' \
  | tr ',' '\n' | grep -oE '"[A-Z_]+":' | tr -d '":'
