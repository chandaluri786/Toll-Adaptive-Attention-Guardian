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

  /** Events whose eventId starts with `prefix` (begins_with on the sort key, so only those rows are read). */
  async eventsFor(walletId, prefix = '') {
    const events = [];
    let startKey;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: prefix ? 'walletId = :w AND begins_with(eventId, :p)' : 'walletId = :w',
          ExpressionAttributeValues: prefix ? { ':w': { S: walletId }, ':p': { S: prefix } } : { ':w': { S: walletId } },
          ProjectionExpression: 'eventId, deltaMinutes, #at',
          ExpressionAttributeNames: { '#at': 'at' },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        events.push({ id: item.eventId.S, deltaMinutes: Number(item.deltaMinutes.N), at: Number(item.at.N) });
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return events;
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
