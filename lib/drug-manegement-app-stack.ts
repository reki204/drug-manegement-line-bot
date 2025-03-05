import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class DrugManegementAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, "lambda", {
      entry: "lambda/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
    });

    fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new apigw.LambdaRestApi(this, "LineBotApi", {
      handler: fn,
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
        partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "takenTime", type: dynamodb.AttributeType.STRING },
        tableName: "MedicationHistory",
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // DynamoDBの読み取り権限をLambdaに付与
    medicationsTable.grantReadData(fn);
    medicationHistoryTable.grantReadData(fn);
  }
}
