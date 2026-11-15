const ts = require('typescript')
const fs = require('node:fs')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

async function test(matched, profileFails = false) {
  let releaseProfile
  const profileGate = new Promise(resolve => { releaseProfile = resolve })
  let sent = 0
  let finished = false
  const saved = []
  const user = { id: 'user', business_account_id: 'business', access_token: 'fake', username: 'owner' }
  const db = { from(table) {
    let inserted
    const query = {
      select() { return this }, eq() { return this }, or() { return this }, in() { return this },
      order() { return this }, limit() { return this }, maybeSingle() { return this },
      update() { return this }, insert(row) { inserted = row; return this },
      single() { return this },
      then(resolve, reject) {
        let data = null
        if (table === 'users') data = [user]
        if (table === 'automations') data = [{ id: 'rule', trigger_source: 'dm', trigger_type: 'keyword', trigger_value: 'price', response_content: { message: '499' } }]
        if (table === 'conversations' && inserted) data = { id: 'conv' }
        if (table === 'messages' && inserted) saved.push(inserted)
        return Promise.resolve({ data }).then(resolve, reject)
      },
    }
    return query
  } }
  let backgroundPromise = null
  const mocks = {
    'next/server': {
      NextResponse: { json: data => data },
      after: (fn) => {
        backgroundPromise = Promise.resolve().then(fn)
        return backgroundPromise
      },
    },
    '@/lib/supabase-server': { getSupabaseServerClient: async () => db },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/supabase-migrate': { ensureSchema: async () => {} },
    '@/lib/instagram-api': {
      fetchProfile: async () => { await profileGate; if (profileFails) throw Error('profile unavailable'); return { username: 'sender' } },
      sendTextDM: async () => { sent++; return { ok: true } },
      sendSenderAction: async () => ({ ok: true }),
      sendCardDM: async () => { sent++; return { ok: true } },
      sendMediaDM: async () => { sent++; return { ok: true } },
      replyToComment: async () => ({ ok: true }),
      buildFollowGateCard: () => ({}),
      buildInitialLinkRequestCard: () => ({}),
      buildStillNotFollowingCard: () => ({}),
      isCommentWithin7Days: () => true,
    },
    '@/lib/ai-reply': {},
    '@/lib/unlock-tracking': { unlockKey: () => 'key', bumpUnlockAttempt: async () => 1, clearUnlockAttempts: async () => {} },
    '@/lib/dedup': { isCommentAlreadyProcessed: async () => false },
    '@/lib/opt-out': {
      detectOptAction: () => null,
      isRecipientOptedOut: async () => false,
      optOutRecipient: async () => {},
      optInRecipient: async () => {},
      OPT_OUT_CONFIRMATION_TEXT: "opted out",
      OPT_IN_CONFIRMATION_TEXT: "opted in",
    },
    '@/lib/spintax': { getSpintaxPublicReply: () => "reply", expandTemplate: (t) => t },
    '@/lib/warmup': { checkAndIncrementWarmupQuota: async () => ({ allowed: true }) },
    '@/lib/jitter': { applyHumanizedJitter: async () => 0 },
    '@/lib/meta-rate-limit': { isMetaThrottled: () => ({ throttled: false }) },
    '@/lib/automation-media': {
      automationTargetsMediaId: () => true,
      getAutomationMediaIds: () => [],
      hasAutomationMediaTarget: () => false,
    },
  }
  process.env.INSTAGRAM_APP_SECRET = 'test-secret'
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('app/api/instagram/webhook/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function('exports', 'require', 'module', code)(module.exports, name => mocks[name] || require(name), module)
  const raw = JSON.stringify({ entry: [{ id: 'business', messaging: [{ sender: { id: 'sender' }, recipient: { id: 'business' }, message: { mid: 'incoming', text: matched ? 'price' : 'unmatched' } }] }] })
  const signature = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex')
  const response = await module.exports.POST({ text: async () => raw, headers: { get: () => signature } })
  assert.deepEqual(response, { ok: true }, 'POST acknowledges Meta webhook immediately')

  // Background task was queued via after()
  let backgroundFinished = false
  if (backgroundPromise) {
    backgroundPromise.then(() => { backgroundFinished = true })
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sent, matched ? 1 : 0, 'keyword reply must not wait for profile lookup')
  assert.equal(backgroundFinished, false, 'background processing must join pending inbox work, even without a match')
  releaseProfile()
  if (backgroundPromise) await backgroundPromise
  assert.equal(sent, matched ? 1 : 0, 'never send twice')
  if (!profileFails) {
    assert.equal(saved.filter(row => row.is_from_instagram).length, 1)
    assert.equal(saved.filter(row => !row.is_from_instagram).length, matched ? 1 : 0)
  }
}
async function main() {
  await test(true)
  await test(false)
  await test(true, true)
  console.log('PASS: reply precedes profile completion; inbox/outgoing saves joined; no-match and profile failure handled')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
