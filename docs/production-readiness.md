# FlashInsta Production Readiness Runbook and Scaling Guide

## 1. System Architecture Overview

FlashInsta automates Instagram direct messages, comments, and story replies for creators.
The architecture uses serverless compute, managed PostgreSQL, and Meta Graph APIs.

```
                  +-----------------------------------+
                  |         Client Browsers           |
                  +-----------------+-----------------+
                                    | HTTPS
                                    v
                  +-----------------------------------+
                  |    Next.js 16 Edge Middleware     |
                  |  - Route protection & auth check  |
                  |  - Rate limiting (40-300 req/min) |
                  |  - 1MB payload size enforcement   |
                  +-----------------+-----------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-----------------------+                           +-------------------+
| Next.js App Router    |                           | Meta Webhooks     |
| - Authenticated APIs  |                           | - SHA256 signed   |
| - Health probe        |                           | - Idempotent dedupe|
| - Structured logger   |                           | - async background|
+-----------+-----------+                           +---------+---------+
            |                                                 |
            +-----------------------+-------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |    Supabase PostgreSQL      |
                     | - Service-role server client|
                     | - Multi-tenant isolation    |
                     | - Connection pooling        |
                     +-----------------------------+
```

---

## 2. Environment Variables Checklist

Configure these environment variables in your Vercel Project Settings:

| Variable | Requirement | Purpose | Validation |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Mandatory | Supabase project URL | Must start with `https://` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mandatory | Public Supabase anon key | JWT string |
| `SUPABASE_SERVICE_ROLE_KEY` | Mandatory | Backend Supabase admin key | Secret JWT string; keep server-only |
| `NEXT_PUBLIC_INSTAGRAM_APP_ID` | Mandatory | Public Meta App ID | Numeric identifier |
| `INSTAGRAM_APP_ID` | Mandatory | Backend Meta App ID | Numeric identifier |
| `INSTAGRAM_APP_SECRET` | Mandatory | Meta App secret key | 32-character hex string |
| `META_APP_SECRET` | Optional | Parent Meta App secret | 32-character hex string |
| `NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI` | Mandatory | OAuth callback address | Must match Meta App configuration |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Mandatory | Webhook verification handshake | Random alphanumeric secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Mandatory | Google OAuth client ID | Google OAuth console string |
| `GOOGLE_CLIENT_ID` | Mandatory | Backend Google OAuth ID | Google OAuth console string |
| `GOOGLE_CLIENT_SECRET` | Mandatory | Google OAuth secret | Google OAuth secret string |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Mandatory | Google OAuth callback | Valid callback URL |
| `NEXT_PUBLIC_APP_URL` | Mandatory | Canonical application domain | e.g. `https://insta-p8-fawn.vercel.app` |
| `SESSION_SECRET` | Mandatory | Cookie encryption HMAC key | Random string (min 32 characters) |
| `GROQ_API_KEY` | Optional | Groq AI auto-reply model key | `gsk_...` key string |
| `INCIDENT_ALERT_WEBHOOK_URL` | Optional | Incident alert dispatcher | Discord or Slack webhook URL |

---

## 3. Operational Incident Runbooks

### Incident 1: Health Probe Reports Degraded (503)
- Symptom: Monitoring tool notifies that `/api/health` returns HTTP 503.
- Cause: Supabase database connection failed or exceeded the 3000ms latency ceiling.
- Remediation steps:
  1. Open the Supabase dashboard project metrics.
  2. Verify active database connections and compute CPU utilisation.
  3. Inspect Supabase connection pooler settings if connections reach saturation.
  4. Test connectivity manually by calling `curl -s https://<domain>/api/health`.

### Incident 2: Meta Webhook Delivery Failures (401 / 403)
- Symptom: Creator automated replies stop firing after comments or DMs.
- Cause: Signature validation failed in `app/api/instagram/webhook/route.ts`.
- Remediation steps:
  1. Verify `INSTAGRAM_APP_SECRET` in Vercel settings matches Meta App dashboard.
  2. If Meta signs deliveries with the parent app secret, set `META_APP_SECRET`.
  3. Inspect recent deployment logs for `[webhook-signature-failed]` events.
  4. Resubscribe the webhook fields in the Meta App dashboard under Instagram Webhooks.

### Incident 3: Instagram Token Expiration or Revocation (190 OAuthException)
- Symptom: Sending direct messages fails with Meta error code 190.
- Cause: Creator changed password, revoked permissions, or the 60-day token expired.
- Remediation steps:
  1. Check `token_expires_at` in the `public.users` table for the affected user.
  2. Trigger the automatic token refresh worker in `lib/instagram.ts`.
  3. If refresh fails, prompt the creator in the dashboard to reconnect their account.

### Incident 4: Outgoing Message Throttling (Error 613)
- Symptom: Outgoing messages fail with Meta error code 613 (Calls to this API have exceeded rate limits).
- Cause: Account sent more than 200 direct messages in an hour to non-responsive recipients.
- Remediation steps:
  1. The system marks messages as failed and logs the delay.
  2. Throttle comment response automation for that creator.
  3. Advise the creator to pause high-frequency comment triggers temporarily.

---

## 4. Rate Limiting and Traffic Management

Traffic enforcement runs at the edge inside `middleware.ts`:

- **Auth Login Limits**: 40 attempts per minute per IP on `/api/auth/google` and `/api/instagram/test-login`.
- **Session Check Limits**: 300 requests per minute per IP on `/api/auth/session` and `/api/auth/accounts`.
- **Direct Message Limits**: 120 requests per minute per IP on `/api/inbox/send` and `/api/instagram/send-message`.
- **Mutation Payload Size**: 1MB maximum payload on all POST, PUT, and PATCH routes.
- **Media Uploads**: 50MB maximum payload on `/api/upload` with stream validation.

---

## 5. Scaling Architecture and Queue Migration

### Current Serverless Model
- FlashInsta processes webhooks concurrently using Next.js `after()` background execution.
- Webhook handlers return HTTP 200 to Meta in under 500ms to prevent delivery retries.
- Work is executed asynchronously in the background serverless execution window.

### Triggers to Migrate to External Queue
Migrate from Next.js `after()` to an external queue (Redis + BullMQ or Inngest / Upstash QStash) when:
- Webhook ingestion rate exceeds 5,000 requests per minute.
- Concurrent outbound DMs exceed 100 simultaneous tasks.
- Background execution duration approaches Vercel serverless function timeout limits (15-60 seconds).

### Architecture Transition Target
When triggers are reached:
1. Webhook endpoint pushes raw payload into an external FIFO queue (Upstash QStash or Redis).
2. Worker processes consume queue items with configurable concurrency and automatic retry backoff.
3. Database writes use batched upserts to minimise connection load.

---

## 6. Disaster Recovery and Backup Policy

- **Database Point-in-Time Recovery**: Supabase PITR retains transaction logs for 7 days.
- **Data Pruning**: Webhook audit logs older than 90 days are deleted periodically.
- **Data Erasure**: Creator requests to erase data execute GDPR and CCPA compliant cascades via `/api/privacy/erase`.
