import {
  getMedications,
  deleteMedication,
} from "../services/medicationService";
import {
  getMedicationHistory,
  recordMedicationHistory,
} from "../services/historyService";
import type { messagingApi, MessageEvent } from "@line/bot-sdk";

/**
 * 受け取ったメッセージに応じて処理を分岐
 * @param event LINEのメッセージイベント
 * @param client LINE Messaging APIクライアント
 */
export const handleTextMessage = async (
  event: MessageEvent,
  client: messagingApi.MessagingApiClient
) => {
  if (event.message.type !== "text") return;

  const replyToken = event.replyToken;
  const userId = event.source.userId!;
  const userInputMessage = event.message.text;

  let responseText = "コマンドが認識できませんでした。";

  if (userInputMessage === "お薬リスト") {
    responseText = await getMedications(userId);
  } else if (userInputMessage === "服用履歴") {
    responseText = await getMedicationHistory(userId);
  } else if (userInputMessage === "飲みました") {
    const medicationId = ""; // リクエストからほしい
    responseText = await recordMedicationHistory(userId, medicationId); // ←今後選択式に対応
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: responseText }],
  });
};
