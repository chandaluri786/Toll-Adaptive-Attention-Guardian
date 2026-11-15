// OWNER: C (C8). Base URL of the AWS ledger stack (cloud/ledger, stack `toll-ledger`, us-east-2).
// It is public, so it's safe to commit. null would mean "not deployed": sync off, the phone keeps working locally.
// No trailing slash. C10's extension keeps its own copy.
export const LEDGER_API_URL: string | null = 'https://w73jkps50l.execute-api.us-east-2.amazonaws.com';
