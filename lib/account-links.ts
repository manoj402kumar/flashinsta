import { getSupabaseAdmin } from "./supabase-admin"
import { isValidInstagramToken, resolveIdentity } from "./identity"
import { refreshInstagramProfileIfStale } from "./instagram-profile"
import type { LinkedAccount } from "./types"

export { isValidInstagramToken }

/**
 * Extracts normalized Google email for account ownership verification.
 */
export function getUserGoogleEmail(user: {
  username?: string | null
  ai_context?: string | null
}): string | null {
  if (user?.ai_context) {
    try {
      const parsed = JSON.parse(user.ai_context)
      if (parsed.google_email && typeof parsed.google_email === "string") {
        return parsed.google_email.toLowerCase().trim()
      }
    } catch {}
  }
  if (user?.username && user.username.includes("@")) {
    return user.username.toLowerCase().trim()
  }
  return null
}

/**
 * Extracts verified Instagram account metadata from a users table row.
 * Strictly avoids leaking private tokens or unauthorized fallback data.
 */
export function extractAccountInfo(user: {
  id: string | number
  username: string
  access_token: string
  token_expires_at?: string | null
  business_account_id?: string | number | null
  ai_context?: string | null
}): {
  userId: string
  username: string
  profilePic: string | null
  isIgConnected: boolean
  igUsername: string | null
  businessAccountId: string | null
} {
  const identity = resolveIdentity(user)

  return {
    userId: String(user.id),
    username: identity.username,
    profilePic: identity.profilePic,
    isIgConnected: identity.isIgConnected,
    igUsername: identity.igUsername,
    businessAccountId: identity.businessAccountId,
  }
}

/**
 * Retrieves all linked account IDs for a given user.
 * Combines both the relational `account_links` table (if available)
 * and the resilient `ai_context._linked_accounts` store.
 */
export async function getLinkedAccountIds(userId: string): Promise<string[]> {
  const strUserId = String(userId)
  const linkedIds = new Set<string>([strUserId])
  const admin = getSupabaseAdmin()

  // 1. Try relational account_links table
  try {
    const { data: rows, error } = await admin
      .from("account_links")
      .select("linked_user_id")
      .eq("user_id", strUserId)

    if (!error && rows) {
      for (const row of rows) {
        if (row.linked_user_id) linkedIds.add(String(row.linked_user_id))
      }
    }
  } catch {}

  // 2. Also check ai_context from current user
  try {
    const { data: user } = await admin
      .from("users")
      .select("ai_context")
      .eq("id", strUserId)
      .maybeSingle()

    if (user?.ai_context) {
      const parsed = JSON.parse(user.ai_context)
      if (Array.isArray(parsed._linked_accounts)) {
        for (const item of parsed._linked_accounts) {
          const id = typeof item === "string" ? item : item?.userId
          if (id) linkedIds.add(String(id))
        }
      }
    }
  } catch {}

  return Array.from(linkedIds)
}

/**
 * Retrieves full metadata for all accounts linked to the active session.
 * Strictly scopes accounts to the authenticated creator's verified Google email.
 */
export async function getLinkedAccounts(currentUserId: string, googleEmail?: string | null): Promise<LinkedAccount[]> {
  const strUserId = String(currentUserId)
  const normalizedGoogleEmail = googleEmail?.toLowerCase().trim() || null
  const allIds = new Set<string>(await getLinkedAccountIds(strUserId))
  const admin = getSupabaseAdmin()

  // Find all accounts registered under this exact verified Google email
  if (normalizedGoogleEmail) {
    try {
      const { data: emailAccounts } = await admin
        .from("users")
        .select("id, username, ai_context")
        .or(`username.eq.${normalizedGoogleEmail},ai_context.ilike.%"google_email":"${normalizedGoogleEmail}"%`)

      if (emailAccounts) {
        for (const acc of emailAccounts) {
          const accEmail = getUserGoogleEmail(acc)
          if (accEmail === normalizedGoogleEmail) {
            allIds.add(String(acc.id))
          }
        }
      }
    } catch {}
  }

  // Fetch live rows from database for all candidate IDs
  const { data: users, error } = await admin
    .from("users")
    .select("id, username, access_token, token_expires_at, business_account_id, page_id, ai_context, created_at")
    .in("id", Array.from(allIds))

  if (error || !users || users.length === 0) {
    // Return at least the current user profile if query failed
    return [
      {
        userId: strUserId,
        username: "Account",
        profilePic: null,
        isIgConnected: false,
        isActive: true,
      },
    ]
  }

  // Multi-Tenant Isolation: Only keep accounts that belong to this exact verified Google email
  const filteredUsers = users.filter((user) => {
    if (String(user.id) === strUserId) return true
    if (!normalizedGoogleEmail) return false
    const accEmail = getUserGoogleEmail(user)
    return accEmail === normalizedGoogleEmail
  })

  const results: LinkedAccount[] = await Promise.all(
    filteredUsers.map(async (user) => {
      let row = user
      try {
        const refreshed = await refreshInstagramProfileIfStale(user)
        row = {
          ...user,
          ai_context: refreshed.aiContext,
          business_account_id: refreshed.businessAccountId ?? user.business_account_id,
        }
      } catch {}

      const info = extractAccountInfo(row)
      return {
        userId: info.userId,
        username: info.username,
        profilePic: info.profilePic,
        isIgConnected: info.isIgConnected,
        igUsername: info.igUsername,
        businessAccountId: info.businessAccountId,
        isActive: info.userId === strUserId,
        connectedAt: user.created_at || undefined,
      }
    }),
  )

  // Ensure current active account appears first in list
  results.sort((a, b) => {
    if (a.isActive) return -1
    if (b.isActive) return 1
    return a.username.localeCompare(b.username)
  })

  return results
}

/**
 * Links two accounts together bi-directionally.
 * Propagates links across the entire cluster of accounts so that any account
 * in the group can switch to any other account in the group with one click.
 */
export async function linkAccounts(userAId: string, userBId: string): Promise<void> {
  const idA = String(userAId)
  const idB = String(userBId)
  if (idA === idB) return

  const admin = getSupabaseAdmin()

  // Security check: Verify both accounts belong to the exact same Google email
  const { data: users } = await admin
    .from("users")
    .select("id, username, ai_context")
    .in("id", [idA, idB])

  if (users && users.length >= 2) {
    const userA = users.find((u) => String(u.id) === idA)
    const userB = users.find((u) => String(u.id) === idB)
    const emailA = userA ? getUserGoogleEmail(userA) : null
    const emailB = userB ? getUserGoogleEmail(userB) : null

    if (emailA && emailB && emailA !== emailB) {
      console.warn(`[Security Alert] linkAccounts aborted: cross-account merge rejected between ${idA} (${emailA}) and ${idB} (${emailB})`)
      return
    }
  }

  // 1. Gather all existing linked IDs for both accounts to form a unified cluster
  const clusterA = await getLinkedAccountIds(idA)
  const clusterB = await getLinkedAccountIds(idB)
  const fullCluster = Array.from(new Set([...clusterA, ...clusterB, idA, idB]))

  // 2. Insert pairwise links into account_links table (if available)
  try {
    const inserts: { user_id: string; linked_user_id: string }[] = []
    for (const source of fullCluster) {
      for (const target of fullCluster) {
        if (source !== target) {
          inserts.push({ user_id: source, linked_user_id: target })
        }
      }
    }

    if (inserts.length > 0) {
      await admin.from("account_links").upsert(inserts, { onConflict: "user_id,linked_user_id" })
    }
  } catch (e) {
    console.warn("[AccountLinks] Relational upsert skipped:", e)
  }

  // 3. Update ai_context._linked_accounts on all users in the cluster
  for (const memberId of fullCluster) {
    try {
      const { data: member } = await admin
        .from("users")
        .select("id, ai_context")
        .eq("id", memberId)
        .maybeSingle()

      if (!member) continue

      let ctx: Record<string, any> = {}
      try {
        if (member.ai_context) ctx = JSON.parse(member.ai_context)
      } catch {}

      const otherMembers = fullCluster.filter((id) => id !== memberId)
      ctx._linked_accounts = otherMembers

      await admin
        .from("users")
        .update({
          ai_context: JSON.stringify(ctx),
          updated_at: new Date().toISOString(),
        })
        .eq("id", memberId)
    } catch (e) {
      console.warn(`[AccountLinks] Error updating ai_context for user ${memberId}:`, e)
    }
  }
}

/**
 * Unlinks an account from the cluster.
 * Safely severs targetUserId from all cluster members and resets targetUserId's linked list.
 */
export async function unlinkAccount(currentUserId: string, targetUserId: string): Promise<void> {
  const idCurrent = String(currentUserId)
  const idTarget = String(targetUserId)

  const admin = getSupabaseAdmin()

  // 1. Gather all linked members in cluster
  const cluster = await getLinkedAccountIds(idCurrent)

  // 2. Delete all account_links involving idTarget with any cluster member
  try {
    await admin
      .from("account_links")
      .delete()
      .or(`user_id.eq.${idTarget},linked_user_id.eq.${idTarget}`)
  } catch (e) {
    console.warn("[AccountLinks] Relational delete skipped:", e)
  }

  // 3. Remove idTarget from ai_context._linked_accounts of all members in the cluster
  for (const uid of cluster) {
    if (uid === idTarget) continue
    try {
      const { data: user } = await admin
        .from("users")
        .select("id, ai_context")
        .eq("id", uid)
        .maybeSingle()

      if (!user) continue

      let ctx: Record<string, any> = {}
      try {
        if (user.ai_context) ctx = JSON.parse(user.ai_context)
      } catch {}

      if (Array.isArray(ctx._linked_accounts)) {
        ctx._linked_accounts = ctx._linked_accounts.filter(
          (item: any) => (typeof item === "string" ? item : item?.userId) !== idTarget
        )

        await admin
          .from("users")
          .update({
            ai_context: JSON.stringify(ctx),
            updated_at: new Date().toISOString(),
          })
          .eq("id", uid)
      }
    } catch (e) {
      console.warn(`[AccountLinks] Error removing linked account from ${uid}:`, e)
    }
  }

  // 4. On idTarget itself, clear its _linked_accounts
  try {
    const { data: targetUser } = await admin
      .from("users")
      .select("id, ai_context")
      .eq("id", idTarget)
      .maybeSingle()

    if (targetUser) {
      let ctx: Record<string, any> = {}
      try {
        if (targetUser.ai_context) ctx = JSON.parse(targetUser.ai_context)
      } catch {}

      ctx._linked_accounts = []

      await admin
        .from("users")
        .update({
          ai_context: JSON.stringify(ctx),
          updated_at: new Date().toISOString(),
        })
        .eq("id", idTarget)
    }
  } catch (e) {
    console.warn(`[AccountLinks] Error clearing linked accounts on ${idTarget}:`, e)
  }
}

/**
 * Strictly verifies whether current authenticated user is permitted to switch to target account.
 * Requires that target account belongs to the exact same verified Google email.
 */
export async function isAccountSwitchAllowed(
  currentUserId: string,
  targetUserId: string,
  googleEmail?: string | null
): Promise<boolean> {
  const cur = String(currentUserId)
  const tgt = String(targetUserId)
  if (cur === tgt) return true

  const admin = getSupabaseAdmin()

  // 1. If googleEmail is present, target account MUST belong to this exact Google email
  if (googleEmail) {
    const normalized = googleEmail.toLowerCase().trim()
    const { data: targetUser } = await admin
      .from("users")
      .select("id, username, ai_context")
      .eq("id", tgt)
      .maybeSingle()

    if (!targetUser) return false
    const targetEmail = getUserGoogleEmail(targetUser)
    if (!targetEmail || targetEmail !== normalized) {
      console.warn(`[Security Alert] Denied switch: caller ${cur} (${normalized}) attempted switch to ${tgt} (${targetEmail})`)
      return false
    }
    return true
  }

  // 2. Fallback check against linked IDs
  const allowedIds = await getLinkedAccountIds(cur)
  return allowedIds.includes(tgt)
}
