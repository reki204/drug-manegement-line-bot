import {
  getMedications,
  getMedicationsForQuickReply,
} from "../services/medicationService";
import { getMedicationHistory } from "../services/historyService";
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

    if (userInputMessage === "飲みました") {
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
            data: `action=recordMedication&medicationName=${medication.name}&medicationId=${medication.medicationId}`,
            displayText: `${medication.name}を飲みました`,
          },
        })
      );

      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "どの薬を飲みましたか？お薬リストから選択してください。",
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
