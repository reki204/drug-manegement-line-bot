import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { dynamoDB } from "../utils/dynamoClient";

/**
 * 指定したユーザーの服用履歴を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
export const getMedicationHistory = async (userId: string) => {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const params = {
    TableName: "MedicationHistory",
    KeyConditionExpression: "userId = :userId AND takenTime >= :threeDaysAgo",
    ExpressionAttributeValues: {
      ":userId": { S: userId },
      ":threeDaysAgo": { S: threeDaysAgo.toISOString() },
    },
  };

  try {
    const result = await dynamoDB.send(new QueryCommand(params));
    if (!result.Items || result.Items.length === 0) {
      return "直近3日間の服用履歴はありません。";
    }
    // ISO形式の日付を "YYYY/MM/DD HH:mm" に変換
    const formattedHistory = result.Items.map((item) => {
      const date = new Date(item.takenTime.S || "");
      return `📅 ${item.name}: ${date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // 24時間表示
      })}`;
    }).join("\n");
    return formattedHistory;
  } catch (error) {
    console.error("Error fetching medication history:", error);
    return "服用履歴を取得できませんでした。";
  }
};

/**
 * 服用履歴を記録
 * @param userId ユーザーID
 * @param medicationId 薬のID
 * @returns 返却するメッセージ
 */
export const recordMedicationHistory = async (
  userId: string,
  medicationId: string
) => {
  const params = {
    TableName: "MedicationHistory",
    Item: {
      historyId: { S: uuidv4() },
      medicationId: { S: medicationId },
      userId: { S: userId },
      takenTime: { S: new Date().toISOString() },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
    return `服用履歴を更新しました。`;
  } catch (error) {
    console.error("Error adding medication:", error);
    return "服用履歴の更新に失敗しました。";
  }
};
