// OWNER: B (Spec B — task B10, P1). Lambda entry: Bedrock Converse with MODEL_ID (a cross-region
// inference profile, e.g. us.anthropic.claude-sonnet-4-6). The AWS SDK v3 ships with the
// nodejs22.x runtime, so the function has no dependencies. Nothing is stored.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { createHandler } from './handler.mjs';

const MAX_TOKENS = 4096;
const client = new BedrockRuntimeClient({});

async function invoke(prompt) {
  const out = await client.send(
    new ConverseCommand({
      modelId: process.env.MODEL_ID,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: MAX_TOKENS, temperature: 0.7 },
    }),
  );
  return (out.output?.message?.content ?? []).map((c) => c.text ?? '').join('');
}

export const handler = createHandler({ invoke });
