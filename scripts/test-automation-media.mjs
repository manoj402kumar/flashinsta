import test from "node:test"
import assert from "node:assert/strict"

import {
  MAX_RULE_MEDIA_IDS,
  automationTargetsMediaId,
  buildMediaSelection,
  formatSeparatedWorkflowName,
  getAutomationMediaIds,
  hasAutomationMediaTarget,
  normalizeMediaIds,
} from "../lib/automation-media.ts"

test("legacy single media rule still resolves from specific_media_id", () => {
  assert.deepEqual(getAutomationMediaIds({ specific_media_id: "17890000000000001" }), [
    "17890000000000001",
  ])
})

test("media_selection.media_ids is authoritative over specific_media_id", () => {
  assert.deepEqual(
    getAutomationMediaIds({
      specific_media_id: "first",
      media_selection: { media_ids: ["first", "second", "third"] },
    }),
    ["first", "second", "third"],
  )
})

test("old media_selection.reel_id shape is read when specific_media_id is absent", () => {
  assert.deepEqual(getAutomationMediaIds({ media_selection: { reel_id: "legacy-reel" } }), [
    "legacy-reel",
  ])
})

test("a rule without media targets is global", () => {
  assert.deepEqual(getAutomationMediaIds({}), [])
  assert.equal(hasAutomationMediaTarget({}), false)
})

test("normalizeMediaIds trims, de-duplicates, drops invalid values, and caps the list", () => {
  assert.deepEqual(normalizeMediaIds([" a ", "a", 42, "", null, "b"]), ["a", "42", "b"])

  const oversized = Array.from({ length: MAX_RULE_MEDIA_IDS + 5 }, (_, index) => `id-${index}`)
  assert.equal(normalizeMediaIds(oversized).length, MAX_RULE_MEDIA_IDS)
})

test("automationTargetsMediaId matches any selected target exactly", () => {
  const rule = { media_selection: { media_ids: ["a", "b", "c"] } }
  assert.equal(automationTargetsMediaId(rule, "a"), true)
  assert.equal(automationTargetsMediaId(rule, "c"), true)
  assert.equal(automationTargetsMediaId(rule, "d"), false)
  assert.equal(automationTargetsMediaId(rule, null), false)
})

test("buildMediaSelection stores a list or null for global rules", () => {
  assert.deepEqual(buildMediaSelection(["a", "b"]), { media_ids: ["a", "b"] })
  assert.equal(buildMediaSelection([]), null)
})

test("formatSeparatedWorkflowName formats separate workflow names with caption snippets or indices", () => {
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 0, 1, "Some caption"),
    "Product Launch"
  )
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 0, 3, "New AI tool launch today!"),
    'Product Launch · "New AI tool launch today…"'
  )
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 1, 3, null),
    "Product Launch · Post 2"
  )
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 2, 3, ""),
    "Product Launch · Post 3"
  )
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 0, 3, "New AI tool launch today!", "promo"),
    'Reply to "promo" · "New AI tool launch today…"'
  )
  assert.equal(
    formatSeparatedWorkflowName("Product Launch", 1, 3, null, "ALL_COMMENTS"),
    "Reply to every comment · Post 2"
  )
})
