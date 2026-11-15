# cloud/quiz — Person B (Spec B — task B10, P1)

**Delivers:** study quizzes. One request when the day is planned carries all of the day's study topics; the Lambda runs
the planning-doc prompt ("The quiz, and how it is generated") on Bedrock once per topic, in parallel, and returns 9
questions each. **Nothing is stored server-side** and topics are never logged (only counts, timings and error names).

## API
- `POST /quiz` — body exactly `{ "topics": ["Graph algorithms", ...] }`: 1–7 strings, each 1–80 chars (trimmed, deduped
  by case), body ≤ 2 KB. Any other field → `400`.
  → `200 { "<topic>": [{ "q", "options": [4 strings], "correct": 0–3 }, ×9], ... }`. A topic the model garbled twice is
  left out; if no topic worked → `502 { "error" }`. The app checks the schema again, retries once, then verifies that study
  task by phone-down focus instead.
- Server-side checks: exactly 9 questions, 4 distinct non-empty options, `correct` 0–3, no "all/none of the above".
  Malformed output is retried once per topic (if > 12 s of the 29 s budget is left). Options are shuffled so the right
  answer isn't always first.

## Code
`src/quiz.mjs` (prompt, schema, shuffle, per-topic retry), `src/handler.mjs` (HTTP boundary, 400/502), `src/index.mjs`
(Bedrock Converse with `MODEL_ID`; the AWS SDK v3 ships with nodejs22.x, so no dependencies). Tests inject the model:
`cd cloud/quiz && npm test` (Node's test runner, no install).

## Deploy (HTTP API throttled to 2 rps / burst 5 — every call is a Bedrock bill; 256 MB arm64; 7-day logs)
```
cd cloud/quiz && sam build && sam deploy     # samconfig.toml: stack toll-quiz, us-east-2
sam delete --stack-name toll-quiz --region us-east-2   # teardown (only us-east-2 is allowed by the org policy)
```
Live: `https://jh1zokqxt1.execute-api.us-east-2.amazonaws.com` (also `QUIZ_API_URL` in `src/day/quizConfig.ts`).
Model: parameter `ModelId`, default `us.anthropic.claude-sonnet-4-6` (US cross-region inference profile).
`anthropic.claude-sonnet-5-5` is listed in us-east-2 but returns `AccessDeniedException … is not available for this account`.

**Status 2026-11-15:** live. Bedrock access opened after the account's Anthropic use-case form was submitted (the IAM
user also needed `aws-marketplace:ViewSubscriptions`/`Subscribe`). Smoke test: 2 topics → 9 + 9 questions in 6.4 s; 7 topics
→ 200 in 7.2 s. Rerun:
```
curl -s -X POST https://jh1zokqxt1.execute-api.us-east-2.amazonaws.com/quiz -H 'content-type: application/json' -d '{"topics":["Graph algorithms"]}'
```
