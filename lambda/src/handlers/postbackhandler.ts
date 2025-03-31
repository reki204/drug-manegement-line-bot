import { messagingApi, PostbackEvent } from "@line/bot-sdk";
import { deleteMedication } from "../services/medicationService";
import { deleteMedicationSchedules } from "../services/reminderService";

/**
 * Postbackイベントのハンドラ
 *
 * @param event Postbackイベント
 * @param client LINE Messaging APIクライアント
 */
export const handlePostbackEvent = async (
  event: PostbackEvent,
  client: messagingApi.MessagingApiClient
) => {
  const replyToken = event.replyToken;
  const userId = event.source.userId!;
  const data = event.postback.data;

  const params = new URLSearchParams(data);
  const action = params.get("action");
  const medicationName = params.get("medicationName");
  const medicationId = params.get("medicationId");
  let responseText = "";

  // 薬の削除
  if (action === "deleteMedication" && medicationId) {
    await deleteMedication(userId, medicationId);
    await deleteMedicationSchedules(medicationId);
    responseText = `${medicationName}を削除しました。`;
  } else {
    responseText = "削除対象の薬が特定できませんでした。";
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: responseText }],
  });
};
