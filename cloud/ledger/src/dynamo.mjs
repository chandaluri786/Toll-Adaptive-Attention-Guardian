// DynamoDB store for the ledger table (walletId HASH, eventId RANGE). Lambda's runtime ships the AWS SDK v3.
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

export const createDynamoStore = ({ tableName, client = new DynamoDBClient({}) }) => ({
  async putIfAbsent({ walletId, eventId, deltaMinutes, at }) {
    try {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            walletId: { S: walletId },
            eventId: { S: eventId },
            deltaMinutes: { N: String(deltaMinutes) },
            at: { N: String(at) },
          },
          ConditionExpression: 'attribute_not_exists(eventId)',
        }),
      );
      return true;
    } catch (error) {
      if (error?.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  },

  async deltasFor(walletId) {
    const deltas = [];
    let startKey;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'walletId = :w',
          ExpressionAttributeValues: { ':w': { S: walletId } },
          ProjectionExpression: 'deltaMinutes',
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) deltas.push(Number(item.deltaMinutes.N));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return deltas;
  },
});
