// DynamoDB store for the pair table (code HASH, TTL on expiresAt in epoch seconds).
import { DeleteItemCommand, DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

export const createDynamoPairStore = ({ tableName, client = new DynamoDBClient({}) }) => ({
  async putIfAbsent({ code, walletId, expiresAt }) {
    try {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: { code: { S: code }, walletId: { S: walletId }, expiresAt: { N: String(expiresAt) } },
          ConditionExpression: 'attribute_not_exists(code)',
        }),
      );
      return true;
    } catch (error) {
      if (error?.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  },

  /** Delete the row and return what was there, in one atomic call: two claims can't both win. */
  async take(code) {
    const { Attributes: item } = await client.send(
      new DeleteItemCommand({ TableName: tableName, Key: { code: { S: code } }, ReturnValues: 'ALL_OLD' }),
    );
    if (!item) return null;
    return { code: item.code.S, walletId: item.walletId.S, expiresAt: Number(item.expiresAt.N) };
  },
});
