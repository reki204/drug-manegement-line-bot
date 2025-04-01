import { messagingApi, PostbackEvent } from "@line/bot-sdk";
import {
  deleteMedication,
  getMedicationById,
} from "../services/medicationService";
import {
  deleteMedicationSchedules,
  scheduleNextIntervalReminder,
} from "../services/reminderService";
import { recordMedicationHistory } from "../services/historyService";

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

  // 服用履歴の追加
  if (action === "recordMedication" && medicationId) {
    // 服用履歴を記録
    responseText = await recordMedicationHistory(userId, medicationId);

    const medication = await getMedicationById(userId, medicationId);
    if (medication && medication.intervalHours != "0") {
      // 次のインターバル通知をスケジュール（インターバル時間が設定されている場合）
      await scheduleNextIntervalReminder(userId, medicationId, new Date());
      responseText += `\n次の通知を${medication.intervalHours}時間後に設定しました。`;
    }
  }

  // 薬の削除
  if (action === "deleteMedication" && medicationId) {
    await deleteMedication(userId, medicationId);
    await deleteMedicationSchedules(medicationId);
    responseText = `${medicationName}を削除しました。`;
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: responseText }],
  });
};
