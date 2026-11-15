// OWNER: B (B10). Base URL of the quiz Lambda (cloud/quiz, stack `toll-quiz`, us-east-2). Public, so
// it's safe to commit. null = not deployed: no quizzes, study tasks verify by phone-down focus.
// No trailing slash.
export const QUIZ_API_URL: string | null = 'https://jh1zokqxt1.execute-api.us-east-2.amazonaws.com';
