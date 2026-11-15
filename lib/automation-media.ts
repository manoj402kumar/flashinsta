// Shared media-target helpers for automation rules.
//
// A rule can target:
//   - no media  -> global trigger (all posts/reels or all stories)
//   - one media -> legacy shape, stored in specific_media_id
//   - many media -> stored as { media_ids: [...] } in media_selection (JSONB)
//
// specific_media_id mirrors the first target so older readers keep working
// during a rolling deploy, while media_selection.media_ids is authoritative
// for the full selection.

export const MAX_RULE_MEDIA_IDS = 100

export interface AutomationMediaTarget {
  specific_media_id?: string | null
  media_selection?: unknown
}

function normalizeMediaId(value: unknown): string | null {
  if (typeof value === "string") {
    const id = value.trim()
    return id || null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

export function normalizeMediaIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const ids: string[] = []

  for (const raw of value) {
    const id = normalizeMediaId(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= MAX_RULE_MEDIA_IDS) break
  }

  return ids
}

function readMediaSelection(value: unknown): { mediaIds: string[]; reelId: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { mediaIds: [], reelId: null }
  }

  const selection = value as Record<string, unknown>
  return {
    mediaIds: normalizeMediaIds(selection.media_ids),
    reelId: normalizeMediaId(selection.reel_id),
  }
}

export function getAutomationMediaIds(
  rule: AutomationMediaTarget | null | undefined,
): string[] {
  if (!rule) return []

  const selection = readMediaSelection(rule.media_selection)
  if (selection.mediaIds.length > 0) return selection.mediaIds

  const legacyId = normalizeMediaId(rule.specific_media_id)
  if (legacyId) return [legacyId]

  return selection.reelId ? [selection.reelId] : []
}

export function hasAutomationMediaTarget(
  rule: AutomationMediaTarget | null | undefined,
): boolean {
  return getAutomationMediaIds(rule).length > 0
}

export function automationTargetsMediaId(
  rule: AutomationMediaTarget | null | undefined,
  mediaId: string | null | undefined,
): boolean {
  const id = normalizeMediaId(mediaId)
  if (!id) return false
  return getAutomationMediaIds(rule).includes(id)
}

export function buildMediaSelection(mediaIds: string[]): { media_ids: string[] } | null {
  return mediaIds.length > 0 ? { media_ids: mediaIds } : null
}

export function formatSeparatedWorkflowName(
  baseName: string,
  index: number,
  total: number,
  caption?: string | null,
  customTriggerValue?: string | null,
): string {
  let effectiveBase = baseName.trim()
  if (customTriggerValue && customTriggerValue.trim()) {
    const cleanTrigger = customTriggerValue.trim()
    if (cleanTrigger.toUpperCase() === "ALL_COMMENTS") {
      effectiveBase = "Reply to every comment"
    } else {
      effectiveBase = `Reply to "${cleanTrigger}"`
    }
  }

  if (total <= 1) return effectiveBase.slice(0, 100).trim()

  const cleanCaption =
    typeof caption === "string"
      ? caption.replace(/[\r\n\t]+/g, " ").trim().replace(/^["']|["']$/g, "")
      : ""
  const snippet = cleanCaption
    ? cleanCaption.slice(0, 24) + (cleanCaption.length > 24 ? "…" : "")
    : ""

  const suffix = snippet ? ` · "${snippet}"` : ` · Post ${index + 1}`
  const maxBaseLen = 100 - suffix.length
  const trimmedBase = effectiveBase.slice(0, Math.max(10, maxBaseLen)).trim()
  return `${trimmedBase}${suffix}`
}
