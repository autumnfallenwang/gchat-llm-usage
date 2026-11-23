// Posts to a Google Chat space through its incoming webhook.
// https://developers.google.com/workspace/chat/quickstart/webhooks

import { log } from "./logger.js";
import type { Message } from "./rules.js";

/**
 * The URL to post a message to. With a thread key, `messageReplyOption` makes it reply in that
 * thread (or start it). Without one, the option must be left off: Google refuses it with a 400,
 * "The request does not specify which message to reply to". The URL's `key` and `token` are kept.
 */
export function postUrl(webhookUrl: string, message: Message): string {
  const url = new URL(webhookUrl);
  if (message.threadKey) {
    url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
  }
  return url.toString();
}

export function body(message: Message): Record<string, unknown> {
  return message.threadKey
    ? { text: message.text, thread: { threadKey: message.threadKey } }
    : { text: message.text };
}

class ChatError extends Error {
  constructor(
    readonly status: number,
    reason: string,
  ) {
    super(`Google Chat webhook: HTTP ${status}${reason ? ` (${reason})` : ""}`);
  }
}

async function send(webhookUrl: string, message: Message, timeoutMs: number): Promise<void> {
  const res = await fetch(postUrl(webhookUrl, message), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body(message)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // The URL is a credential, so errors name the status and Google's reason, never the URL.
  if (!res.ok) throw new ChatError(res.status, await errorReason(res));
}

/**
 * Posts a message. If Google refuses the threaded form with a 400, the message goes out once more
 * without a thread: the thread is a nicety, the alert is the point, and a post that kept failing
 * would hold up every alert after it.
 */
export async function post(webhookUrl: string, message: Message, timeoutMs: number): Promise<void> {
  try {
    await send(webhookUrl, message, timeoutMs);
  } catch (err) {
    if (!(err instanceof ChatError && err.status === 400 && message.threadKey)) throw err;
    log.warn(
      { event: "gchat.thread_refused", err_message: err.message },
      "Google Chat refused the threaded post; sending it unthreaded",
    );
    await send(webhookUrl, { ...message, threadKey: null }, timeoutMs);
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
