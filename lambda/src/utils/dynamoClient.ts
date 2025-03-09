import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const dynamoDB = new DynamoDBClient({ region: "ap-northeast-1" });
