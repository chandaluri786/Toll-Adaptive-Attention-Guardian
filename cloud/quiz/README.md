# cloud/quiz — Person B (Spec B — task B10, P1)

**Delivers:** study quizzes. One request when the day is planned carries all of the day's topics; the Lambda runs the prompt from the planning doc ("The quiz, and how it is generated") on Bedrock once per topic and returns 9 questions each. Nothing is stored server-side. The app validates the schema, retries once, then falls back to a focus session.

Skeleton: `template.yaml` (AWS SAM) + `src/index.mjs`. Needs Bedrock model access on your AWS account.
