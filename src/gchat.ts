// Posts to a Google Chat space through its incoming webhook.
// https://developers.google.com/workspace/chat/quickstart/webhooks

import type { Message } from "./rules.js";

/**
 * The webhook URL with `messageReplyOption` set, so a message with a thread key replies in that
 * thread (or starts it). The URL's own `key` and `token` are kept as they are.
 */
export function postUrl(webhookUrl: string): string {
  const url = new URL(webhookUrl);
  url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
  return url.toString();
}

export function body(message: Message): Record<string, unknown> {
  return message.threadKey
    ? { text: message.text, thread: { threadKey: message.threadKey } }
    : { text: message.text };
}

export async function post(webhookUrl: string, message: Message, timeoutMs: number): Promise<void> {
  const res = await fetch(postUrl(webhookUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body(message)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // The URL is a credential, so errors name the status and Google's reason, never the URL.
  if (!res.ok) {
    const reason = await errorReason(res);
    throw new Error(`Google Chat webhook: HTTP ${res.status}${reason ? ` (${reason})` : ""}`);
  }
}

/** `key=` and `token=` values blanked, in case an error message ever echoes the URL. */
export function redact(text: string): string {
  return text.replace(/\b(key|token)=[^&\s"']+/gi, "$1=…");
}

/** Google's `error.status` and `error.message` from a failed response, redacted and cut short. */
export async function errorReason(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { status?: unknown; message?: unknown } };
    const parts = [json.error?.status, json.error?.message].filter((p) => typeof p === "string");
    return redact(parts.join(": ")).slice(0, 300);
  } catch {
    return "";
  }
}
