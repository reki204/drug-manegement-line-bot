import {
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { dynamoDB } from "../utils/dynamoClient";
import {
  scheduleNextIntervalReminder,
  setScheduleReminders,
} from "./reminderService";

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
      const intervalHours = item.intervalHours?.S || "時間未設定";

      return `💊 ${name}\n  服用時間: ${scheduleTime}\n  服用間隔: ${intervalHours}時間`;
    }).join("\n\n");
  } catch (error) {
    console.error("Error 薬の取得に失敗しました:", error);
    return "薬の情報を取得できませんでした。";
  }
};

/**
 * 特定の薬の取得
 * @param medicationId 薬のID
 * @returns 薬の情報
 */
export const getMedicationById = async (
  userId: string,
  medicationId: string
) => {
  const params = {
    TableName: "Medications",
    Key: {
      userId: { S: userId },
      medicationId: { S: medicationId },
    },
  };

  try {
    const result = await dynamoDB.send(new GetItemCommand(params));
    if (!result.Item) return null;
    return {
      userId: result.Item.userId.S!,
      medicationId: result.Item.medicationId.S!,
      name: result.Item.name.S!,
      scheduleTime: result.Item.scheduleTime?.L?.map((t) => t.S) || [],
      intervalHours: result.Item.intervalHours?.S || "0",
    };
  } catch (err) {
    console.error("Failed to fetch medication", err);
    return null;
  }
};

/**
 * 指定したユーザーの薬一覧取得（クイックリプライ用）
 *
 * @param userId ユーザーID
 * @returns 薬IDと薬名の配列
 */
export const getMedicationsForQuickReply = async (userId: string) => {
  const params = {
    TableName: "Medications",
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": { S: userId },
    },
  };

  try {
    const result = await dynamoDB.send(new ScanCommand(params));
    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // 薬IDと薬名のみを返す
    const medications = result.Items.map((item) => ({
      medicationId: item.medicationId?.S!,
      name: item.name?.S!,
    }));

    return medications;
  } catch (error) {
    console.error("Error fetching medications for quick reply:", error);
    return [];
  }
};

/**
 * 薬の追加
 * 1. 薬情報をDynamoDBの "Medications" テーブルに保存
 * 2. 固定のスケジュール時間があれば、その時間に毎日通知するルールを設定
 * 3. 服用間隔が指定されている場合は、後でユーザーが薬を飲んだタイミングで次回通知をセットアップ
 *
 * @param userId ユーザーID
 * @param name 薬の名前
 * @param scheduleTimes 固定の通知時間（例："08:00", "20:00"）
 * @param intervalHours 服用間隔（例：4）
 */
export const addMedication = async (
  userId: string,
  name: string,
  scheduleTimes: string[],
  intervalHours: number
) => {
  const medicationId = uuidv4();
  const intervalHour = intervalHours?.toString();

  const params = {
    TableName: "Medications",
    Item: {
      userId: { S: userId },
      medicationId: { S: medicationId },
      name: { S: name },
      scheduleTime: {
        L: scheduleTimes.map((time: string) => ({ S: time })),
      },
      intervalHours: { S: intervalHour || "0" },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));

    // 固定のスケジュール時間がある場合は通知をセットアップ
    if (scheduleTimes && scheduleTimes.length > 0) {
      // 各スケジュール時間に対してEventBridgeルールを作成し、毎日通知を実施
      await setScheduleReminders(userId, medicationId);
    }

    // 服用間隔がある場合は通知をセットアップ
    if (intervalHours && intervalHour != "0") {
      // ※ ここでは薬登録時にインターバル通知のルールも同時にセットしているが、
      // 実際はユーザーが薬を飲んだタイミングで scheduleNextIntervalReminder を呼び出すケースもある
      await scheduleNextIntervalReminder(userId, medicationId, new Date());
    }
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
    Key: {
      userId: { S: userId },
      medicationId: { S: medicationId },
    },
  };

  try {
    await dynamoDB.send(new DeleteItemCommand(params));
    return `薬を削除しました`;
  } catch (error) {
    return "薬の削除に失敗しました。";
  }
};
