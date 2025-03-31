import {
  getMedications,
  getMedicationById,
  getMedicationsForQuickReply,
} from "../services/medicationService";
import {
  getMedicationHistory,
  recordMedicationHistory,
} from "../services/historyService";
import { scheduleNextIntervalReminder } from "../services/reminderService";
import type { messagingApi, MessageEvent, QuickReplyItem } from "@line/bot-sdk";

/**
 * 受け取ったメッセージに応じて処理を分岐
 * @param event LINEのメッセージイベント
 * @param client LINE Messaging APIクライアント
 */
export const handleTextMessage = async (
  event: MessageEvent,
  client: messagingApi.MessagingApiClient
) => {
  const replyToken = event.replyToken;

  try {
    if (event.message.type !== "text") return;

    const userId = event.source.userId!;
    const userInputMessage = event.message.text;

    let responseText = "コマンドが認識できませんでした。";

    if (userInputMessage === "お薬リスト") {
      responseText = await getMedications(userId);
    }

    if (userInputMessage === "服用履歴") {
      responseText = await getMedicationHistory(userId);
    }

    // 「飲みました:medicationId」形式のメッセージを処理
    if (userInputMessage.startsWith("飲みました:")) {
      const medicationId = userInputMessage.split(":")[1];
      if (medicationId) {
        // 服用履歴を記録
        responseText = await recordMedicationHistory(userId, medicationId);

        // 次のインターバル通知をスケジュール（インターバル時間が設定されている場合）
        const medication = await getMedicationById(userId, medicationId);
        if (medication && medication.intervalHours != "0") {
          await scheduleNextIntervalReminder(userId, medicationId, new Date());
          responseText += `\n次の通知を${medication.intervalHours}時間後に設定しました。`;
        }
      } else {
        responseText = "薬のIDを認識できませんでした。";
      }
    }

    if (userInputMessage === "飲みました") {
      responseText = "どの薬を飲みましたか？お薬リストから選択してください。";
      const medications = await getMedicationsForQuickReply(userId);
      if (!medications || medications.length === 0) {
        responseText = "登録されている薬はありません。";
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: responseText }],
        });
        return;
      }
      // クイックリプライ形式で薬の名前とIDを提示
      const quickReplyItems: QuickReplyItem[] = medications.map(
        (medication: any) => ({
          type: "action",
          action: {
            type: "message",
            label: medication.name,
            text: `飲みました:${medication.medicationId}`,
          },
        })
      );
      // クイックリプライボタン付きでメッセージを送信
      await client.pushMessage({
        to: userId,
        messages: [
          {
            type: "text",
            text: responseText,
            quickReply: { items: quickReplyItems },
          },
        ],
      });
      return;
    }

    if (userInputMessage === "お薬の削除") {
      const medications = await getMedicationsForQuickReply(userId);
      if (!medications || medications.length === 0) {
        responseText = "登録されている薬はありません。";
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: responseText }],
        });
        return;
      }

      // クイックリプライ形式で薬の名前を提示
      const quickReplyItems: QuickReplyItem[] = medications.map(
        (medication: any) => ({
          type: "action",
          action: {
            type: "postback",
            label: medication.name,
            data: `action=deleteMedication&medicationName=${medication.name}&medicationId=${medication.medicationId}`,
          },
        })
      );

      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "削除したい薬を選択してください。",
            quickReply: { items: quickReplyItems },
          },
        ],
      });
      return;
    }

    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: responseText }],
    });
  } catch (error) {
    console.error("handleTextMessage error:", error);
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "エラーが起きました。管理者に問い合わせてください。",
        },
      ],
    });
  }
};
