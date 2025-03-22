import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class DrugManegementAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const channelAccessToken = ssm.StringParameter.valueForStringParameter(
      this,
      "channel-access-token"
    );

    const channelSecret = ssm.StringParameter.valueForStringParameter(
      this,
      "channel-secret"
    );

    const channelId = ssm.StringParameter.valueForStringParameter(
      this,
      "channel-id"
    );

    // 薬の管理テーブル
    const medicationsTable = new dynamodb.Table(this, "Medications", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "medicationId", type: dynamodb.AttributeType.STRING },
      tableName: "Medications",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 服用履歴テーブル
    const medicationHistoryTable = new dynamodb.Table(
      this,
      "MedicationHistory",
      {
        partitionKey: {
          name: "historyId",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: { name: "takenTime", type: dynamodb.AttributeType.STRING },
        tableName: "MedicationHistory",
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // 服用履歴テーブルに GlobalSecondaryIndex 追加
    medicationHistoryTable.addGlobalSecondaryIndex({
      indexName: "MedicationHistoryByTakenTime",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "takenTime", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Reminder Handler Lambda (EventBridge Schedulerからの呼び出し専用)
    const reminderHandlerLambda = new NodejsFunction(this, "reminderHandler", {
      entry: "lambda/reminder-handler/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        CHANNEL_ACCESS_TOKEN: channelAccessToken,
        CHANNEL_SECRET: channelSecret,
        CHANNEL_ID: channelId,
        ENV: "production",
      },
      timeout: cdk.Duration.seconds(30),
    });

    // API Handler Lambda (APIリクエスト処理用)
    const apiHandlerLambda = new NodejsFunction(this, "apiHandler", {
      entry: "lambda/api-handler/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        CHANNEL_ACCESS_TOKEN: channelAccessToken,
        CHANNEL_SECRET: channelSecret,
        CHANNEL_ID: channelId,
        ENV: "production",
        REMINDER_HANDLER_ARN: reminderHandlerLambda.functionArn,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // API Gateway設定
    new apigw.LambdaRestApi(this, "LineBotApi", {
      handler: apiHandlerLambda,
      defaultCorsPreflightOptions: {
        allowOrigins: ["https://line-drug-manegement-utils.vercel.app"],
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "X-Custom-Header",
          "Upgrade-Insecure-Requests",
          "Authorization",
        ],
        maxAge: cdk.Duration.seconds(30),
      },
    });

    // DynamoDBへのアクセス権限付与
    medicationsTable.grantReadWriteData(apiHandlerLambda);
    medicationHistoryTable.grantReadWriteData(apiHandlerLambda);
    medicationsTable.grantReadWriteData(reminderHandlerLambda);
    medicationHistoryTable.grantReadWriteData(reminderHandlerLambda);

    // EventBridge Schedulerへのアクセス権限をAPI処理用Lambdaに付与
    const schedulerPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "scheduler:CreateSchedule",
        "scheduler:DeleteSchedule",
        "scheduler:GetSchedule",
        "scheduler:UpdateSchedule",
        "scheduler:ListSchedules",
      ],
      resources: [
        `arn:aws:scheduler:${this.region}:${this.account}:schedule/default/med-rem-*`,
      ],
    });

    apiHandlerLambda.addToRolePolicy(schedulerPolicy);

    // EventBridge Scheduler用のIAMロール
    const schedulerRole = new iam.Role(this, "EventBridgeSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      description:
        "Role for EventBridge Scheduler to invoke Reminder Handler Lambda",
    });

    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [reminderHandlerLambda.functionArn],
      })
    );

    // API LambdaからschedulerRole を PassRole できるようにする
    const passRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["iam:PassRole"],
      resources: [schedulerRole.roleArn],
    });
    apiHandlerLambda.addToRolePolicy(passRolePolicy);

    // EventBridge SchedulerからReminder Lambdaを呼び出す権限を付与
    reminderHandlerLambda.addPermission("AllowSchedulerInvoke", {
      principal: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:scheduler:${this.region}:${this.account}:schedule/*`,
    });

    apiHandlerLambda.addEnvironment(
      "SCHEDULER_ROLE_ARN",
      schedulerRole.roleArn
    );
  }
}
