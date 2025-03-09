import { createMiddleware } from "hono/factory";
import { env } from "hono/adapter";
import { Bindings } from "../types/Bindings";
import { validateSignature } from "@line/bot-sdk";

export const lineWebhookMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const signature = c.req.header("x-line-signature");
    const body = await c.req.text();
    const { CHANNEL_SECRET } = env<Bindings>(c);

    if (!signature || !CHANNEL_SECRET)
      return c.text("Missing signature or secret", 400);
    if (!validateSignature(body, CHANNEL_SECRET, signature))
      return c.text("Invalid signature", 403);

    await next();
    return c.text("OK", 200);
  }
);
