import {
  getMedications,
  deleteMedication,
  getMedicationById,
} from "../services/medicationService";
import {
  getMedicationHistory,
  recordMedicationHistory,
} from "../services/historyService";
import { scheduleNextIntervalReminder } from "../services/reminderService";
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
  }

  if (userInputMessage === "服用履歴") {
    responseText = await getMedicationHistory(userId);
  }

  if (userInputMessage.startsWith("飲みました:")) {
    // 「飲みました:medicationId」形式のメッセージを処理
    const medicationId = userInputMessage.split(":")[1];
    if (medicationId) {
      // 服用履歴を記録
      responseText = await recordMedicationHistory(userId, medicationId);

      // 次のインターバル通知をスケジュール（インターバル時間が設定されている場合）
      const medication = await getMedicationById(userId, medicationId);
      if (medication && medication.intervalHours != "0") {
        await scheduleNextIntervalReminder(userId, medicationId, new Date());
        responseText += `\n次の通知は${medication.intervalHours}時間後に設定しました。`;
      }
    } else {
      responseText = "薬のIDを認識できませんでした。";
    }
  } else if (userInputMessage === "飲みました") {
    responseText = "どの薬を飲みましたか？お薬リストから選択してください。";
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: responseText }],
  });
};
