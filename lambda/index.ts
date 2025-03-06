import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
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
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
};

type LineContext = {
  Bindings: Bindings;
  Variables: {
    lineEvents: line.WebhookEvent[];
  };
};

const app = new Hono<LineContext>();
const dynamoDB = new DynamoDBClient({ region: "ap-northeast-1" });
const userState: Record<string, { step: number; stepName?: string }> = {};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

const lineWebhook = createMiddleware<LineContext>(async (c, next) => {
  const signature = c.req.header("x-line-signature");
  const body = await c.req.text();

  if (!signature || !c.env.LINE_CHANNEL_SECRET) {
    return c.text("Missing LINE signature or secret", 400);
  }

  if (!line.validateSignature(body, c.env.LINE_CHANNEL_SECRET, signature)) {
    return c.text("Invalid signature", 403);
  }

  c.set("lineEvents", JSON.parse(body));
  await next();
});

app.get("/", (c) => c.text("Hello Hono!"));
app.use("/webhook", lineWebhook);

app.post("/webhook", async (c) => {
  const events: line.WebhookEvent[] = await c.req
    .json()
    .then((data) => data.events);

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      await handleTextMessage(event);
    }
  }

  return c.json({ message: "Webhook received!" });
});

/**
 * 受け取ったメッセージに応じて処理を分岐
 * @param event
 */
const handleTextMessage = async (event: line.MessageEvent) => {
  if (event.message.type !== "text") return;

  const replyToken = event.replyToken;
  const userId = event.source.userId!;
  // テキストメッセージを取得
  const userMessage = event.message.text;

  let responseText = "コマンドが認識できませんでした。";

  if (userMessage === "お薬リスト") {
    responseText = await getMedications(userId);
  } else if (userMessage === "服用履歴") {
    responseText = await getMedicationHistory(userId);
  } else if (userMessage.startsWith("お薬の追加")) {
    if (userMessage === "お薬の追加") {
      responseText = await startMedicationAddition(userId);
    } else if (userState[userId]?.step === 1) {
      responseText = await handleMedicationName(userId, userMessage);
    } else if (userState[userId]?.step === 2) {
      responseText = await handleMedicationTime(userId, userMessage);
    }
  } else if (userMessage === "飲みました") {
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

    return result.Items.map((item) => `・${item.name?.S}`).join("\n");
  } catch (error) {
    console.error("Error fetching medications:", error);
    return "薬の情報を取得できませんでした。";
  }
};

/**
 * 指定したユーザーの服用履歴を取得
 * @param userId ユーザーID
 * @returns 返却するメッセージ
 */
const getMedicationHistory = async (userId: string) => {
  const params = {
    TableName: "MedicationHistory",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": { S: userId },
    },
  };

  try {
    const result = await dynamoDB.send(new QueryCommand(params));
    if (!result.Items || result.Items.length === 0) {
      return "服用履歴はありません。";
    }

    return result.Items.map((item) => `${item.takenTime.S}`).join("\n");
  } catch (error) {
    console.error("Error fetching medication history:", error);
    return "服用履歴を取得できませんでした。";
  }
};

/**
 * 薬の追加
 * @param userId ユーザーID
 * @param name 薬の名前
 * @param scheduleTimes 薬の通知スケジュール
 * @returns
 */
const addMedication = async (
  userId: string,
  name: string,
  scheduleTimes: string[],
  intervalHours: string
) => {
  const params = {
    TableName: "Medications", // 薬の情報テーブル
    Item: {
      // LINEのユーザーID
      userId: { S: userId },
      // 薬のID
      medicationId: { S: uuidv4() },
      // 薬の名前
      name: { S: name },
      // 設定した服用時間
      scheduleTime: {
        L: scheduleTimes.map((time) => ({ S: time })),
      },
      // 次の服用までの時間(例: 4時間)
      intervalHours: {
        N: intervalHours != null ? intervalHours.toString() : "0",
      },
    },
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
    return `${name} を追加しました！`;
  } catch (error) {
    console.error("Error adding medication:", error);
    return "薬の追加に失敗しました。";
  }
};

/**
 * お薬の追加を開始（ステップ1: 薬の名前を聞く）
 */
const startMedicationAddition = async (userId: string): Promise<string> => {
  userState[userId] = { step: 1 };
  return "追加する薬の名前を入力してください。";
};

/**
 * ステップ1: 薬の名前を受け取る
 */
const handleMedicationName = async (
  userId: string,
  name: string
): Promise<string> => {
  userState[userId].stepName = name;
  userState[userId].step = 2;
  return "服用時間をカンマ区切り（例: 08:00,12:00,20:00）または次の服用までの時間（例: 4時間）を入力してください。";
};

/**
 * ステップ2: 服用時間または間隔を受け取る
 */
const handleMedicationTime = async (
  userId: string,
  timesOrInterval: string
): Promise<string> => {
  const name = userState[userId].stepName!;
  let scheduleTimes: string[] = [];
  let intervalHours = "0";

  if (timesOrInterval.includes(":")) {
    scheduleTimes = timesOrInterval.split(",");
  } else {
    intervalHours = timesOrInterval.replace("時間", "");
  }

  // DynamoDB に登録
  const responseText = await addMedication(
    userId,
    name,
    scheduleTimes,
    intervalHours
  );

  // 状態をクリア
  delete userState[userId];

  return responseText;
};

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
      // LINEのユーザーID
      userId: { S: userId },
      // MedicationsのID（どの薬を飲んだか）
      medicationId: { S: medicationId },
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

export const handler = handle(app);
