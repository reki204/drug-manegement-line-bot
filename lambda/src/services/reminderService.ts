import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { v4 as uuidv4 } from "uuid";
import { getMedicationById } from "./medicationService";

const eventBridgeClient = new EventBridgeClient({ region: "ap-northeast-1" });
const LAMBDA_ARN = process.env.LAMBDA_ARN || "";

/**
 * 固定スケジュールの通知を設定する
 * DynamoDBから薬の情報を取得し、登録された各スケジュール時間（例："08:00"）ごとに
 * EventBridgeルールを作成し、Lambdaをターゲットに設定することで、毎日指定の時間に通知が発火する。
 *
 * @param medicationId 薬のID
 */
export const setScheduleReminders = async (medicationId: string) => {
  const medication = await getMedicationById(medicationId);
  if (!medication) {
    throw new Error(`Medication with ID ${medicationId} not found`);
  }

  // 薬ごとに共通のルール名を作成
  const ruleName = `medication-reminder-${medicationId}`;

  // 登録された各スケジュール時間に対してルールを作成
  for (const scheduleTime of medication.scheduleTime) {
    // 時刻をcron式に変換 (例: "08:00" -> "cron(0 8 * * ? *)")
    const [hour, minute] = scheduleTime!.split(":");
    const cronExpression = `cron(${minute} ${hour} * * ? *)`;

    // EventBridgeルールを作成（毎日指定の時間に発火するルール）
    await eventBridgeClient.send(
      new PutRuleCommand({
        Name: `${ruleName}-${scheduleTime!.replace(":", "-")}`,
        ScheduleExpression: cronExpression,
        State: "ENABLED",
      })
    );

    // 作成したルールに、対象のLambda関数をターゲットとして設定
    await eventBridgeClient.send(
      new PutTargetsCommand({
        Rule: `${ruleName}-${scheduleTime!.replace(":", "-")}`,
        Targets: [
          {
            Id: uuidv4(),
            Arn: LAMBDA_ARN,
            // Lambdaに渡す入力データ。ここでは通知の種別や薬情報などを含める
            Input: JSON.stringify({
              type: "MEDICATION_REMINDER",
              medicationId: medication.medicationId,
              userId: medication.userId,
              scheduledTime: scheduleTime,
            }),
          },
        ],
      })
    );
  }
};

/**
 * 服用間隔に基づく次回通知のセットアップ
 * ユーザーが薬を飲んだ（服用完了）タイミングで、この関数を呼び出し、
 * 最後の服用時刻に基づいて次の通知をスケジュールします。
 *
 * @param medicationId 薬のID
 * @param lastTakenTime 最後に服用した時間
 */
export const scheduleNextIntervalReminder = async (
  medicationId: string,
  lastTakenTime: Date
) => {
  const medication = await getMedicationById(medicationId);
  if (!medication || !medication.intervalHours) return;

  // 次の通知時間を計算 (最後の服用時間 + インターバル時間)
  const nextReminderTime = new Date(lastTakenTime);
  nextReminderTime.setHours(
    nextReminderTime.getHours() + Number(medication.intervalHours)
  );

  // 時・分を抽出してcron式を作成
  const hour = nextReminderTime.getHours();
  const minute = nextReminderTime.getMinutes();
  const day = nextReminderTime.getDate();
  const month = nextReminderTime.getMonth() + 1;
  const year = nextReminderTime.getFullYear();

  // 一度だけ実行されるcron式
  const cronExpression = `cron(${minute} ${hour} ${day} ${month} ? ${year})`;

  // 一意なルール名を作成
  const ruleName = `medication-interval-${medicationId}-${Date.now()}`;

  // EventBridgeルールを作成（一度だけ実行されるルール）
  await eventBridgeClient.send(
    new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: cronExpression,
      State: "ENABLED",
    })
  );

  // 作成したルールに、対象のLambda関数をターゲットとして設定
  await eventBridgeClient.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: uuidv4(),
          Arn: LAMBDA_ARN,
          Input: JSON.stringify({
            type: "MEDICATION_INTERVAL_REMINDER",
            medicationId: medication.medicationId,
            userId: medication.userId,
            intervalHours: medication.intervalHours,
          }),
        },
      ],
    })
  );
};
