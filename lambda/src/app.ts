import { Hono } from "hono";
import { logger } from "hono/logger";
import medicationRoutes from "./routes/medicationsRoutes";
import { lineWebhookMiddleware } from "./line/webhookMiddleware";
import { handleTextMessage } from "./handlers/messageHandler";
import { createLineClient } from "./line/client";
import type { WebhookEvent } from "@line/bot-sdk";

const app = new Hono();

app.use("*", logger());
app.use("/webhook", lineWebhookMiddleware);

app.get("/", (c) => c.text("Hello Hono!"));
app.post("/webhook", async (c) => {
  const lineClient = createLineClient(c);

  const events: WebhookEvent[] = (await c.req.json()).events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      await handleTextMessage(event, lineClient);
    }
  }

  return c.json({ message: "Webhook received" });
});

app.route("/", medicationRoutes);

export default app;
