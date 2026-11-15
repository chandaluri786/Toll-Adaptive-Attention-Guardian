// OWNER: C (C8). Base URL of the AWS ledger stack (cloud/ledger, stack `toll-ledger`, us-west-2).
// It is public, so it's safe to commit. null = not deployed: sync stays off and the phone keeps working locally.
// After `sam deploy`, paste the `ApiUrl` output here (no trailing slash). C10's extension keeps its own copy.
export const LEDGER_API_URL: string | null = null;
