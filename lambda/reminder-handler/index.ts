import { messagingApi } from "@line/bot-sdk";
import { getMedicationById } from "../src/services/medicationService";

/**
 * Reminder Handler Lambdaのハンドラー
 * EventBridge Schedulerからのイベント処理のみを担当
 */
export const handler = async (event: any) => {
  if (
    event.type === "MEDICATION_REMINDER" ||
    event.type === "MEDICATION_INTERVAL_REMINDER"
  ) {
    await sendMedicationReminder(
      event.userId,
      event.medicationId,
      event.scheduledTime,
      event.intervalHours
    );
    return { statusCode: 200, body: "Reminder processed successfully" };
  }

  return { statusCode: 400, body: "Invalid event type" };
};

/**
 * リマインダー通知をLINEに送信する
 * @param userId ユーザーID
 * @param medicationId 薬のID
 * @param scheduledTime スケジュール時間
 * @param intervalHour インターバル時間
 */
const sendMedicationReminder = async (
  userId: string,
  medicationId: string,
  scheduledTime?: string,
  intervalHour?: string
) => {
  const medication = await getMedicationById(userId, medicationId);
  if (!medication) return;

  // LINEクライアント作成 (環境変数からトークンを取得)
  const lineClient = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN!,
  });

  // リマインダーメッセージの作成
  let message = `${medication.name}を飲む時間です。`;
  if (scheduledTime || intervalHour) {
    message += `\n予定時間: ${scheduledTime || intervalHour}`;
  }

  // クイックリプライボタン付きでメッセージを送信
  await lineClient.pushMessage({
    to: userId,
    messages: [
      {
        type: "text",
        text: message,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "飲みました",
                text: `飲みました:${medicationId}`,
              },
            },
          ],
        },
      },
    ],
  });
};
