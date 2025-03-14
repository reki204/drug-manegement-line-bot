import { handle } from "hono/aws-lambda";
import app from "./src/app";
import { handleReminderEvent } from "./src/handlers/reminderHandler";
import type { LambdaEvent, LambdaContext } from "hono/aws-lambda";

/**
 * EventBridgeの通知イベントか、通常のAPIリクエストかを判別して処理を分岐。
 */
export const handler = async (event: LambdaEvent, context: LambdaContext) => {
  const customType = (event as any)?.type;
  if (
    customType === "MEDICATION_REMINDER" ||
    customType === "MEDICATION_INTERVAL_REMINDER"
  ) {
    return await handleReminderEvent(customType);
  }

  return handle(app)(event, context);
};
