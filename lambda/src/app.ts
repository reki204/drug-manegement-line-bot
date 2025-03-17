import { Context, Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { lineWebhookMiddleware } from "./utils/line/webhookMiddleware";
import medicationRoutes from "./routes/medicationsRoutes";
import { createLineClient } from "./utils/line/client";
import { handleTextMessage } from "./handlers/messageHandler";
import type { WebhookEvent } from "@line/bot-sdk";

const app = new Hono();

app.use(
  "/addMedication",
  cors({
    origin: "https://line-drug-manegement-utils.vercel.app",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
    maxAge: 600,
  })
);
app.use("*", logger());
app.use("/webhook", lineWebhookMiddleware);

app.get("/", (c) => c.text("Hello Hono!"));
app.post("/webhook", async (c: Context) => {
  const lineClient = createLineClient(c);

  const events: WebhookEvent[] = (await c.req.json()).events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      await handleTextMessage(event, lineClient);
    }
  }

  return c.json({ message: "Webhook received" });
});

app.route("/addMedication", medicationRoutes);

export default app;
