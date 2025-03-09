import { Hono } from "hono";
import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import * as line from "@line/bot-sdk";
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";

type Bindings = {
  CHANNEL_ACCESS_TOKEN: string;
  CHANNEL_SECRET: string;
};

const medication = new Hono<{ Bindings: Bindings }>();
const dynamoDB = new DynamoDBClient({ region: "ap-northeast-1" });

const lineWebhookMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const signature = c.req.header("x-line-signature");
    const body = await c.req.text();

    const { CHANNEL_SECRET } = env<Bindings>(c);

    if (!signature || !CHANNEL_SECRET) {
      return c.text("Missing LINE signature or CHANNEL_SECRET", 400);
    }

    if (!line.validateSignature(body, CHANNEL_SECRET, signature)) {
      return c.text("Invalid signature", 403);
    }

    await next();
    return c.text("OK", 200);
  }
);

medication.get("/", (c) => c.text("Hello Hono!"));
medication.use("/webhook", lineWebhookMiddleware);

medication.post("/webhook", async (c) => {
  const { CHANNEL_ACCESS_TOKEN } = env<Bindings>(c);
  const lineClient = new line.messagingApi.MessagingApiClient({
    channelAccessToken: CHANNEL_ACCESS_TOKEN,
  });

  const events: line.WebhookEvent[] = await c.req
    .json()
    .then((data) => data.events);

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      await handleTextMessage(event, lineClient);
    }
  }

  return c.json({ message: "Webhook received!" });
});

/**
 * 受け取ったメッセージに応じて処理を分岐
 * @param event
 */
const handleTextMessage = async (
  event: line.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) => {
  if (event.message.type !== "text") return;

  const replyToken = event.replyToken;
  const userId = event.source.userId!;
  // テキストメッセージを取得
  const userInputMessage = event.message.text;

  let responseText = "コマンドが認識できませんでした。";

  if (userInputMessage === "お薬リスト") {
    responseText = await getMedications(userId);
  } else if (userInputMessage === "服用履歴") {
    responseText = await getMedicationHistory(userId);
  } else if (userInputMessage === "飲みました") {
    const medicationId = ""; // リクエストからほしい
    await recordMedicationHistroy(userId, medicationId);
    responseText = "服用履歴を更新します。";
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: responseText }],
  });
};

/**
 * ユーザーが登録している薬一覧を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
const getMedications = async (userId: string) => {
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
 * 指定したユーザーの服用履歴を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
const getMedicationHistory = async (userId: string) => {
  // 3日前のISO日時を取得
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoIso = threeDaysAgo.toISOString();

  const params = {
    TableName: "MedicationHistory",
    KeyConditionExpression: "userId = :userId AND takenTime >= :threeDaysAgo",
    ExpressionAttributeValues: {
      ":userId": { S: userId },
      ":threeDaysAgo": { S: threeDaysAgoIso },
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
 * 薬の追加
 */
medication.post("/addMedication", async (c) => {
  try {
    const { userId, name, scheduleTimes, intervalHours } = await c.req.json();

    if (!userId || !name) {
      return c.json({ error: "Missing required fields" }, 400);
    }

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

    await dynamoDB.send(new PutItemCommand(params));
    return c.json({ message: `${name} を追加しました！` }, 201);
  } catch (error) {
    console.error("Error adding medication:", error);
    return c.json({ error: "薬の追加に失敗しました。" }, 500);
  }
});

/**
 * 服用履歴を記録
 * @param userId ユーザーID
 * @param medicationId 薬のID
 */
const recordMedicationHistroy = async (
  userId: string,
  medicationId: string
) => {
  const params = {
    TableName: "MedicationHistory",
    Item: {
      historyId: { S: uuidv4() },
      // MedicationsのID（どの薬を飲んだか）
      medicationId: { S: medicationId },
      // LINEのユーザーID
      userId: { S: userId },
      // 実際に服用した時間
      takenTime: { S: new Date().toISOString() },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
    console.log("服用履歴に正常に追加されました。");
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
// クイックリプライ
const deleteMedication = async (userId: string, medicationId: string) => {
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

export default medication;
