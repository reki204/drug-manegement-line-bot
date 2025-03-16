import {
  SchedulerClient,
  CreateScheduleCommand,
  CreateScheduleCommandInput,
  ListSchedulesCommand,
  DeleteScheduleCommand,
  ListSchedulesCommandInput,
} from "@aws-sdk/client-scheduler";
import { getMedicationById } from "./medicationService";

const schedulerClient = new SchedulerClient({
  region: "ap-northeast-1",
});
const LAMBDA_ARN = process.env.REMINDER_HANDLER_ARN || "";
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN || "";

/**
 * 固定スケジュールの通知を設定する
 * DynamoDBから薬の情報を取得し、登録された各スケジュール時間（例："08:00"）ごとに
 * Schedulerを作成し、Lambdaをターゲットに設定することで、毎日指定の時間に通知が発火する
 *
 * @param userId ユーザーID
 * @param medicationId 薬のID
 */
export const setScheduleReminders = async (
  userId: string,
  medicationId: string
) => {
  const medication = await getMedicationById(userId, medicationId);
  if (!medication) {
    throw new Error(`Medication with ID ${medicationId} not found`);
  }

  const medShort = medication.medicationId.substring(0, 8);

  // 登録された各スケジュール時間の数に応じてスケジューラーを作成
  for (const scheduleTime of medication.scheduleTime) {
    if (!scheduleTime) continue;
    const [hour, minute] = scheduleTime.split(":");
    const cronExpression = `cron(${minute} ${hour} * * ? *)`;

    const scheduleName = `med-rem-${medShort}-${hour}${minute}`;

    const inputPayload = JSON.stringify({
      type: "MEDICATION_REMINDER",
      medicationId: medication.medicationId,
      userId: medication.userId,
      scheduledTime: scheduleTime,
    });

    const createScheduleParams: CreateScheduleCommandInput = {
      Name: scheduleName,
      ScheduleExpression: cronExpression,
      ScheduleExpressionTimezone: "Asia/Tokyo",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: LAMBDA_ARN,
        RoleArn: SCHEDULER_ROLE_ARN,
        Input: inputPayload,
      },
    };

    try {
      await schedulerClient.send(
        new CreateScheduleCommand(createScheduleParams)
      );
      console.log("Created schedule:", scheduleName);
    } catch (error) {
      console.error("Error creating schedule:", error);
    }
  }
};

/**
 * 服用間隔に基づく次回通知のセットアップ
 * ユーザーが薬を飲んだ（服用完了）タイミングで、この関数を呼び出し、
 * 最後の服用時刻に基づいて次の通知をスケジュールする
 *
 * @param userId ユーザーID
 * @param medicationId 薬のID
 * @param lastTakenTime 最後に服用した時間
 */
export const scheduleNextIntervalReminder = async (
  userId: string,
  medicationId: string,
  lastTakenTime?: Date
) => {
  const medication = await getMedicationById(userId, medicationId);
  if (!medication || !medication.intervalHours) return;

  // 次の通知時間を計算 (最後の服用時間 + インターバル時間)
  const nextReminderTime = new Date(lastTakenTime!);
  nextReminderTime.setHours(
    nextReminderTime.getHours() + Number(medication.intervalHours)
  );

  const isoString = nextReminderTime.toISOString();
  // ISO文字列からミリ秒、Zを除去
  const isoWithoutMsAndZ = isoString.split(".")[0];
  const atExpression = `at(${isoWithoutMsAndZ})`;

  // 一意なスケジュール名を作成
  const medIdShort = medication.medicationId.substring(0, 8);
  const scheduleName = `med-int-${medIdShort}-${Date.now()}`;

  const inputPayload = JSON.stringify({
    type: "MEDICATION_INTERVAL_REMINDER",
    medicationId: medication.medicationId,
    userId: medication.userId,
    intervalHours: medication.intervalHours,
  });

  const createScheduleParams: CreateScheduleCommandInput = {
    Name: scheduleName,
    ScheduleExpression: atExpression,
    FlexibleTimeWindow: { Mode: "OFF" },
    ActionAfterCompletion: "DELETE",
    Target: {
      Arn: LAMBDA_ARN,
      RoleArn: SCHEDULER_ROLE_ARN,
      Input: inputPayload,
    },
  };

  try {
    await schedulerClient.send(new CreateScheduleCommand(createScheduleParams));
    console.log("Created one-time schedule:", scheduleName);
  } catch (error) {
    console.error("Error creating one-time schedule:", error);
  }
};

/**
 * 指定した薬に関連するスケジュール（固定通知および服用間隔通知）を削除する
 *
 * @param medicationId 薬のID
 */
export const deleteMedicationSchedules = async (medicationId: string) => {
  const medShort = medicationId.substring(0, 8);
  const prefixes = [`med-rem-${medShort}-`, `med-int-${medShort}-`];

  let nextToken: string | undefined = undefined;
  const schedulesToDelete: string[] = [];

  try {
    do {
      const listParams: ListSchedulesCommandInput = {
        NamePrefix: "med-",
        MaxResults: 100,
        NextToken: nextToken,
      };

      const listResult = await schedulerClient.send(
        new ListSchedulesCommand(listParams)
      );
      if (listResult.Schedules) {
        for (const schedule of listResult.Schedules) {
          if (schedule.Name) {
            if (prefixes.some((prefix) => schedule.Name!.startsWith(prefix))) {
              schedulesToDelete.push(schedule.Name);
            }
          }
        }
      }
      nextToken = listResult.NextToken;
    } while (nextToken);

    for (const scheduleName of schedulesToDelete) {
      await schedulerClient.send(
        new DeleteScheduleCommand({ Name: scheduleName })
      );
    }

    console.log(`Total schedules deleted: ${schedulesToDelete.length}`);
  } catch (error) {
    console.error("Error listing or deleting schedules:", error);
  }
};
