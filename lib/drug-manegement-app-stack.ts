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

    const fn = new NodejsFunction(this, "lambda", {
      entry: "lambda/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        CHANNEL_ACCESS_TOKEN: channelAccessToken,
        CHANNEL_SECRET: channelSecret,
        CHANNEL_ID: channelId,
        ENV: "production",
        LAMBDA_ARN: "",
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Lambda FunctionのARNを環境変数に追加
    fn.addEnvironment("LAMBDA_ARN", fn.functionArn);

    fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new apigw.LambdaRestApi(this, "LineBotApi", {
      handler: fn,
      defaultCorsPreflightOptions: {
        allowOrigins: ["https://line-drug-manegement-utils.vercel.app"],
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "X-Custom-Header",
          "Upgrade-Insecure-Requests",
        ],
        maxAge: cdk.Duration.seconds(600),
      },
    });

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
      indexName: "UserIdIndex",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "takenTime", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    medicationsTable.grantReadWriteData(fn);
    medicationHistoryTable.grantReadWriteData(fn);

    // EventBridgeへのアクセス権限をLambdaに付与
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

    fn.addToRolePolicy(eventBridgePolicy);

    // Lambda自身を呼び出す権限を追加
    const lambdaInvokePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["lambda:InvokeFunction"],
      resources: [fn.functionArn],
    });

    fn.addToRolePolicy(lambdaInvokePolicy);

    // EventBridgeからLambdaを呼び出す権限を付与
    fn.addPermission("AllowEventBridgeInvoke", {
      principal: new iam.ServicePrincipal("events.amazonaws.com"),
      action: "lambda:InvokeFunction",
    });
  }
}
