import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { dynamoDB } from "../utils/dynamoClient";
import { getMedicationById } from "./medicationService";

/**
 * 指定したユーザーの服用履歴を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
export const getMedicationHistory = async (userId: string) => {
  // 2週間前までのデータを取得
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const params = {
    TableName: "MedicationHistory",
    IndexName: "MedicationHistoryByTakenTime",
    KeyConditionExpression: "userId = :userId AND takenTime >= :twoWeeksAgo",
    ExpressionAttributeValues: {
      ":userId": { S: userId },
      ":twoWeeksAgo": { S: twoWeeksAgo.toISOString() },
    },
  };

  try {
    const result = await dynamoDB.send(new QueryCommand(params));
    if (!result.Items || result.Items.length === 0) {
      return "直近14日間の服用履歴はありません。";
    }

    // ISO形式の日付を "YYYY/MM/DD HH:mm" に変換
    const formattedHistory = result.Items.map((item) => {
      const date = new Date(item.takenTime.S || "");
      const medicationName = item.medicationName.S;

      return `📅 ${medicationName}: ${date.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
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
  // 薬の情報を取得
  const medication = await getMedicationById(userId, medicationId);
  if (!medication) {
    return "指定された薬が見つかりませんでした。";
  }

  const now = new Date();
  const historyId = uuidv4();

  const params = {
    TableName: "MedicationHistory",
    Item: {
      historyId: { S: historyId },
      medicationId: { S: medicationId },
      userId: { S: userId },
      takenTime: { S: now.toISOString() },
      medicationName: { S: medication.name },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
    return `${medication.name}の服用履歴を記録しました。`;
  } catch (error) {
    console.error("Error adding medication history:", error);
    return "服用履歴の更新に失敗しました。";
  }
};
