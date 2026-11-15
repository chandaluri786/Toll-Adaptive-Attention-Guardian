// OWNER: B (Spec B — task B10, P1). Body: { topics: string[] } → { [topic]: Question[9] }. Store nothing.
export const handler = async () => {
  return { statusCode: 501, body: JSON.stringify({ error: 'not implemented yet — task B10' }) };
};
