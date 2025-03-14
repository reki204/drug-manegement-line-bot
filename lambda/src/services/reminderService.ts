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
 * ユーザーの薬の通知スケジュールを設定
 * @param medicationId 薬のID
 * @returns 作成されたルールの名前
 */
export const setScheduleReminders = async (
  medicationId: string
): Promise<string> => {
  const medication = await getMedicationById(medicationId);
  if (!medication) {
    throw new Error(`Medication with ID ${medicationId} not found`);
  }

  // 薬ごとにユニークなルール名を作成
  const ruleName = `medication-reminder-${medicationId}`;

  // すべてのスケジュール時間に対してルールを作成
  for (const scheduleTime of medication.scheduleTime) {
    // 時刻をcron式に変換 (例: "08:00" -> "cron(0 8 * * ? *)")
    const [hour, minute] = scheduleTime!.split(":");
    const cronExpression = `cron(${minute} ${hour} * * ? *)`;

    // EventBridgeルールを作成
    await eventBridgeClient.send(
      new PutRuleCommand({
        Name: `${ruleName}-${scheduleTime!.replace(":", "-")}`,
        ScheduleExpression: cronExpression,
        State: "ENABLED",
      })
    );

    // Lambda関数をターゲットとして設定
    await eventBridgeClient.send(
      new PutTargetsCommand({
        Rule: `${ruleName}-${scheduleTime!.replace(":", "-")}`,
        Targets: [
          {
            Id: uuidv4(),
            Arn: LAMBDA_ARN,
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

  return ruleName;
};

/**
 * インターバル時間に基づいて次の通知を設定
 * @param medicationId 薬のID
 * @param lastTakenTime 最後に服用した時間
 */
export const scheduleNextIntervalReminder = async (
  medicationId: string,
  lastTakenTime: Date
): Promise<void> => {
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

  // イベントブリッジルールの名前
  const ruleName = `medication-interval-${medicationId}-${Date.now()}`;

  // ルールを作成
  await eventBridgeClient.send(
    new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: cronExpression,
      State: "ENABLED",
    })
  );

  // Lambda関数をターゲットとして設定
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
