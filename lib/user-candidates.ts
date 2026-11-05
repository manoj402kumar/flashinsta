/**
 * Resolves user IDs for multi-tenant data queries.
 * In a secure multi-tenant architecture, each account is strictly isolated.
 * A session user only ever accesses data matching their own userId.
 */
export async function resolveCandidateUserIds(userId: string | number): Promise<string[]> {
  if (!userId) return []
  return [String(userId)]
}
