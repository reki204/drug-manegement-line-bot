import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { env } from "hono/adapter";
import { Bindings } from "../../types/Bindings";
import { validateSignature } from "@line/bot-sdk";

export const lineWebhookMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const signature = c.req.header("x-line-signature");
    const body = await c.req.text();
    const { CHANNEL_SECRET } = env<Bindings>(c);

    if (!signature || !CHANNEL_SECRET)
      throw new HTTPException(400, { message: "Missing signature or secret" });

    if (!validateSignature(body, CHANNEL_SECRET, signature))
      throw new HTTPException(403, { message: "Invalid signature" });

    await next();
  }
);
