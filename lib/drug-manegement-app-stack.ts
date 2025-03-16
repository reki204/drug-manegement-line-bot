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

    // Reminder Handler Lambda (EventBridgeからの呼び出し専用)
    const reminderHandlerLambda = new NodejsFunction(this, "reminderHandler", {
      entry: "lambda/reminder-handler/index.ts", // 新しいパスに配置する想定
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

    // Lambda Function URLの設定
    apiHandlerLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
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

    // EventBridgeへのアクセス権限をAPI処理用Lambdaに付与
    const eventBridgePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "events:PutRule",
        "events:PutTargets",
        "events:DeleteRule",
        "events:RemoveTargets",
        "events:DescribeRule",
        "events:ListTargetsByRule",
      ],
      resources: ["*"],
    });

    apiHandlerLambda.addToRolePolicy(eventBridgePolicy);

    // API LambdaからReminder Lambdaを呼び出す権限を追加
    const lambdaInvokePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["lambda:InvokeFunction"],
      resources: [reminderHandlerLambda.functionArn],
    });

    apiHandlerLambda.addToRolePolicy(lambdaInvokePolicy);

    // EventBridgeからReminder Lambdaを呼び出す権限を付与
    reminderHandlerLambda.addPermission("AllowEventBridgeInvoke", {
      principal: new iam.ServicePrincipal("events.amazonaws.com"),
      action: "lambda:InvokeFunction",
    });
  }
}
