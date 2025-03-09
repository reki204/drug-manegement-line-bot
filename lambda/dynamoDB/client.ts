import {
  DynamoDBClient,
  ListTablesCommand,
  CreateTableCommand,
  KeyType,
  ScalarAttributeType,
  ProjectionType,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const devConfig = {
  endpoint: "http://localhost:8000",
  region: "ap-northeast-1",
  credentials: {
    accessKeyId: "accessKeyId",
    secretAccessKey: "secretAccessKey",
  },
};

const prodConfig = {
  region: "ap-northeast-1",
};

const client = new DynamoDBClient(
  process.env.ENV === "development" ? devConfig : prodConfig
);

const docClient = DynamoDBDocumentClient.from(client);

const createMedicationsTable = async () => {
  const params = {
    TableName: "Medications",
    KeySchema: [
      { AttributeName: "medicineId", KeyType: KeyType.HASH },
      { AttributeName: "userId", KeyType: KeyType.RANGE },
    ],
    AttributeDefinitions: [
      { AttributeName: "medicineId", AttributeType: ScalarAttributeType.S },
      { AttributeName: "userId", AttributeType: ScalarAttributeType.S },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log("✅ Medications テーブル作成完了");
  } catch (err) {
    console.log(err);
  }
};

const createMedicationHistoryTable = async () => {
  const params = {
    TableName: "MedicationHistory",
    KeySchema: [
      { AttributeName: "historyId", KeyType: KeyType.HASH },
      { AttributeName: "takenTime", KeyType: KeyType.RANGE },
    ],
    AttributeDefinitions: [
      { AttributeName: "medicationId", AttributeType: ScalarAttributeType.S },
      { AttributeName: "takenTime", AttributeType: ScalarAttributeType.S },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
    GlobalSecondaryIndexes: [
      {
        IndexName: "UserIdIndex",
        KeySchema: [{ AttributeName: "userId", KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log("✅ MedicationHistory テーブル作成完了");
  } catch (err) {
    console.log(err);
  }
};

const initDynamoDB = async () => {
  if (process.env.ENV === "development") {
    try {
      const { TableNames } = await client.send(new ListTablesCommand({}));
      if (
        TableNames &&
        (!TableNames.includes("Medications") ||
          !TableNames.includes("MedicationHistory"))
      ) {
        await createMedicationsTable();
        await createMedicationHistoryTable();
      } else if (TableNames) {
        console.log("Medications, MedicationHistory table already exists");
      } else {
        console.log("Unable to list tables, creating Medications table");
        await createMedicationsTable();
        await createMedicationHistoryTable();
      }
    } catch (err) {
      console.error("Error initializing DynamoDB:", err);
    }
  }
};

initDynamoDB();

export { docClient };
