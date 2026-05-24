import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
};

function validatePayload(payload: NotificationPayload): NotificationPayload {
  const title = payload.title?.trim();
  const content = payload.content?.trim();
  if (!title || !content) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title and content are required.",
    });
  }
  return { title, content };
}

/**
 * Optional owner notifications via webhook (Slack, Discord, email gateway, etc.).
 * Set NOTIFY_WEBHOOK_URL in .env. If unset, logs to server console only.
 */
export async function notifyOwner(
  payload: NotificationPayload,
): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  const webhook = process.env.NOTIFY_WEBHOOK_URL?.trim();

  if (!webhook) {
    console.log(`[Notification] ${title}: ${content}`);
    return false;
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Webhook failed (${response.status})${
          detail ? `: ${detail}` : ""
        }`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Webhook error:", error);
    return false;
  }
}
