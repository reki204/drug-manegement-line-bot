import {
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { dynamoDB } from "../utils/dynamoClient";

/**
 * ユーザーが登録している薬一覧を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
export const getMedications = async (userId: string) => {
  const params = {
    TableName: "Medications",
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: { ":userId": { S: userId } },
  };

  try {
    const result = await dynamoDB.send(new ScanCommand(params));
    if (!result.Items || result.Items.length === 0) {
      return "登録されている薬はありません。";
    }

    return result.Items.map((item) => {
      const name = item.name?.S;
      const scheduleTime =
        item.scheduleTime?.L?.map((t) => t.S).join(", ") ||
        "スケジュール未設定";
      const intervalHours = item.intervalHours?.N || "時間未設定";

      return `💊 ${name}\n  服用時間: ${scheduleTime}\n  服用間隔: ${intervalHours}`;
    }).join("\n\n");
  } catch (error) {
    console.error("Error 薬の取得に失敗しました:", error);
    return "薬の情報を取得できませんでした。";
  }
};

/**
 * 薬の追加
 * @param userId 
 * @param name 
 * @param scheduleTimes 
 * @param intervalHours 
 */
export const addMedication = async (
  userId: string,
  name: string,
  scheduleTimes: string[],
  intervalHours: number
) => {
  const params = {
    TableName: "Medications",
    Item: {
      userId: { S: userId },
      medicationId: { S: uuidv4() },
      name: { S: name },
      scheduleTime: {
        L: scheduleTimes.map((time: string) => ({ S: time })),
      },
      intervalHours: { N: intervalHours?.toString() || "0" },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
  } catch (error) {
    console.error("Error adding medication:", error);
  }
};

/**
 * 薬を削除する
 * @param userId ユーザーID
 * @param medicationId 薬のID
 * @returns 返却するメッセージ
 */
export const deleteMedication = async (
  userId: string,
  medicationId: string
) => {
  const params = {
    TableName: "Medications",
    Key: { userId: { S: userId }, medicationId: { S: medicationId } },
  };

  try {
    await dynamoDB.send(new DeleteItemCommand(params));
    return `薬を削除しました`;
  } catch (error) {
    return "薬の削除に失敗しました。";
  }
};
