# Meta Instagram Comment Automation: Official Rules, Regulations & Account Safety Guide

This document is the master compliance manual and technical reference for developers, creators, and agency owners deploying Instagram comment automation and comment-to-DM funnels. Adhering to these rules guarantees account safety, prevents action blocks and shadowbans, and ensures 100% compliance with Meta's official Platform Terms and Developer Policies.

---

## 1. Executive Summary: Official API vs. Browser Bots

| Dimension | Official Meta Graph & Messaging API | Unofficial Browser / Scraper Bots |
| :--- | :--- | :--- |
| **Method** | Meta OAuth, Webhooks, Official Endpoints | Headless Chrome, Puppeteer, Selenium, Session Cookies |
| **Credential Safety** | Token-based; passwords never handled | Stores raw Instagram passwords / session cookies |
| **Meta Terms of Use** | **100% Authorized & Compliant** | **Strictly Prohibited** (Section 3.2.3 violation) |
| **Account Ban Risk** | **Zero ban risk** when limits & policies are respected | **Very High** (Checkpoint flags, action blocks, permanent bans) |
| **Delivery Reliability** | Real-time Webhook push (< 1 second) | Delayed polling, brittle selector breaks, CAPTCHAs |

> [!CAUTION]
> **Zero-Tolerance for Password-Based Automation:** Meta’s security systems actively detect automated headless browsers via browser fingerprinting, behavioral analysis, canvas/webGL signatures, and IP reputation. Never use browser scraping or store raw passwords for customer accounts. All comment automation must run through the official **Instagram Graph API** and **Instagram Messaging API**.

---

## 2. Meta Platform Terms & Developer Policies

Every automated comment tool must adhere to the **Meta Platform Terms** and **Meta Developer Policies**:

### A. User-Initiated Consent (No Cold Outreach)
* **Policy Mandate:** Automated messages and interactions cannot be initiated unsolicited.
* **The Comment Trigger:** A user posting a comment matching a specific keyword or intent on an organic post, Reel, or ad is recognized by Meta as explicit **inbound consent**.
* **Contextual Relevance:** If an automation prompt states *"Comment GUIDE to get our PDF,"* the automation must deliver that exact guide. Misleading users with deceptive keyword prompts to deliver unrelated promotional material violates Meta's Commercial Terms and Community Standards.

### B. Prohibited Content & Behavior
* **Artificial Engagement & Manipulation:** Coordinating comment networks, buying fake engagement, or flooding comment sections to artificially game Instagram’s Explore or algorithmic feed violates Section 3 of Meta Platform Terms.
* **Prohibited Goods & Services:** Automations may not promote tobacco, prescription medications, weapons, adult products, multi-level marketing scams, or deceptive financial schemes.
* **Opt-Out & Unsubscribe:** If a user expresses a desire to stop receiving automated messages (e.g., replies `STOP`, `UNSUBSCRIBE`, or `CANCEL`), the tool must immediately cease automated messaging to that user.

---

## 3. Official Comment-to-DM (Private Replies) Technical Rules

The **Private Replies API** allows your business or creator account to send an automated direct message to a user who commented on your post or reel.

### Hard Constraints Enforced by Meta:
1. **The "One Private Reply" Rule:**
   * Meta permits **exactly one private reply** per comment.
   * Attempting to send a second private reply to the same comment ID will result in a Graph API error.
2. **The 7-Day Expiration Window:**
   * For standard posts, ads, and Reels, a private reply can only be triggered within **7 days** of the comment being published. After 7 days, the comment ID is ineligible for a private reply.
3. **Instagram Live Comments:**
   * Private replies to Live video comments must be sent **in real-time while the broadcast is active**. Once the live stream terminates, the ability to send private replies to live comments is closed.
4. **The 24-Hour Standard Messaging Window:**
   * Sending an automated private reply sends a message directly to the user's Instagram inbox with a reference link to their comment.
   * **Crucial Rule:** Sending a private reply does **NOT** open the standard 24-hour messaging window.
   * The 24-hour messaging window opens **only when the user replies to your private message**. Once the user replies, your automation or human agents have 24 hours to interact freely.

---

## 4. Public Comment Reply Technical Limitations

When automating public replies in the comment section (`POST /{ig-comment-id}/replies`):

* **Top-Level Comments Only:** Meta only supports replying programmatically to top-level comments on media objects. Attempting to reply to an existing nested reply will attach the comment back to the root top-level thread.
* **Hidden Comments:** Your application cannot post public replies to comments that have been hidden or flagged as offensive.
* **Live Video Comments:** The standard comment replies endpoint cannot be used for Instagram Live streams.
* **Character & Tag Limits:**
  * Maximum comment length: **2,200 characters**.
  * Maximum `@mentions` per comment: **Meta allows up to 5 mentions**. Using more than 2-3 automated mentions per comment will trigger spam filters.
  * Maximum hashtags: **30 hashtags maximum** (best practice: 0-3 hashtags in automated replies).

---

## 5. Rate Limits & Throttling Architecture

Meta enforces rate limits at multiple tiers. Violating these thresholds triggers immediate API throttling, HTTP 429 status codes, or temporary account restrictions.

### A. Hard Technical Ceilings (Meta Enforced)

| Action | Meta Hard Limit | Recommended Safe Operational Threshold |
| :--- | :--- | :--- |
| **Private Replies (Posts/Reels)** | **750 calls / hour** per account | **150 – 250 calls / hour** (smoothed via queue) |
| **Private Replies (Live Video)** | **100 calls / second** | **20 – 40 calls / second** |
| **Graph API User Budget** | **200 calls / hour** per user-app pair | Adaptive dynamic batching |
| **Public Comment Replies** | Regulated by Business Use Case (BUC) | **60 – 120 replies / hour** |

### B. Business Use Case (BUC) Header Monitoring
Every API response from the Instagram Graph API includes the `X-Business-Use-Case-Usage` header:

```json
{
  "x-business-use-case-usage": {
    "17841464058784787": [
      {
        "type": "instagram",
        "call_count": 45,
        "total_cputime": 12,
        "total_time": 10,
        "estimated_time_to_regain_access": 0
      }
    ]
  }
}
```

* **`call_count`:** Percentage (0–100%) of the allocated hourly quota consumed.
* **`estimated_time_to_regain_access`:** Minutes/seconds the app must sleep if throttled.
* **Safety Threshold:** If `call_count` exceeds **80%**, your automation worker must automatically pause and queue pending jobs until the rolling window resets.

---

## 6. Account Safety & Anti-Ban Architecture

To protect connected Instagram accounts from spam detection flags and temporary "Action Blocks" (Error 368), your backend automation architecture must enforce the following safeguards:

```
[ Inbound Comment Webhook ]
            │
            ▼
[ Idempotency Deduplication (Redis/DB) ]
            │
            ▼
[ Account Warmup & Quota Check ]
            │
            ├── Exceeded ──► [ Exponential Backoff Queue ]
            │
            ▼ (Under Limit)
[ AI Spintax / Message Variation Engine ]
            │
            ▼
[ Jitter Delay Engine (5s – 45s Humanized Delay) ]
            │
            ▼
[ Official Meta Graph API Dispatch ]
```

### 1. Spintax & Message Variation Engine
* **The Danger:** Sending the identical response (e.g., *"Check your DM!"*) 100 times in an hour is the #1 trigger for Meta's automated spam classification.
* **The Requirement:** Always vary public and private responses using dynamic template engines or AI rewrites:
  * Example Template: `"{Hey|Hi|Hello} @{username}! {Just sent you|Sent you|Delivered} the {link|guide|details} in your DM! 🚀"`
  * Cycle through at least 10–20 unique comment reply variations.

### 2. Jitter & Humanized Pacing
* Never fire responses instantly in sub-second clusters.
* Introduce a randomized delay of **5 to 45 seconds** between processing comment replies.
* For private DMs, introduce a randomized delay of **3 to 15 seconds**.

### 3. Queueing & Viral Spike Protection
* When a Reel or Post goes viral and receives 5,000 comments in 10 minutes:
  * **DO NOT** attempt to blast 5,000 requests to Meta simultaneously.
  * Ingest comments into a durable queue (e.g., BullMQ, RabbitMQ, or Supabase queues).
  * Drain the queue at a steady, compliant rate (e.g., maximum 3–4 private replies per minute per account).
  * Because the private reply window is valid for **7 days**, pacing over several hours is 100% compliant and preserves account standing.

### 4. Account Age Warm-Up Schedule
For newly connected accounts or accounts that have never used automation before:

* **Days 1 – 3:** Max 20 – 30 automated actions / day
* **Days 4 – 7:** Max 50 – 80 automated actions / day
* **Days 8 – 14:** Max 150 – 250 automated actions / day
* **Day 15+:** Standard production pacing (up to 500 – 1,000+ daily actions paced across 24 hours)

---

## 7. Error Codes & Graceful Handling Matrix

Your application must handle official Meta Graph API error codes cleanly:

| Error Code | Error Subcode | Root Cause | System Remediation Action |
| :--- | :--- | :--- | :--- |
| **190** | 460 / 463 / 467 | Access Token Expired or Revoked (password change, logout, 60-day expiry) | Pause automations for this account. Notify user to re-authenticate via OAuth. |
| **368** | — | **Temporarily Blocked for Spam / Policy Violation** | Immediately halt all automations on this account for 24 hours. Notify admin. Diversify templates. |
| **551** | — | Recipient Unavailable (user blocked account, deactivated profile, or privacy settings restrict DMs) | Mark task as complete/failed. Do not retry to avoid burn. |
| **4 / 17 / 32** | — | API Rate Limit Throttling | Inspect `estimated_time_to_regain_access`. Back off exponentially. |
| **100** | 2018001 / 2534040 | Comment ID invalid, older than 7 days, or already replied to | Log as non-retryable dead letter. Drop from queue. |

---

## 8. Webhook Best Practices & Idempotency

1. **Sub-3-Second Acknowledgment:**
   * Meta Webhook servers expect an immediate `HTTP 200 OK` response within 5 seconds (preferably < 2 seconds).
   * Do not run the automation logic synchronously inside the webhook handler. Ingest the payload, enqueue the job, and return `200 OK` immediately.
2. **Idempotency Guarantee:**
   * Meta webhooks can re-deliver payloads if network latency occurs.
   * Store `comment_id` in a deduplication cache (e.g. Redis key with a 7-day TTL). If the `comment_id` has already been processed, acknowledge with `200 OK` and ignore duplicate execution.

---

## 9. Final Account Safety Checklist

Before activating comment automation for any live Instagram account, verify:
- [ ] Account is converted to an **Instagram Professional Account** (Business or Creator).
- [ ] Account is connected to an official **Facebook Page** and managed via **Meta Business Suite**.
- [ ] Authentication uses **Meta OAuth 2.0** (no username/password storage).
- [ ] Comment webhook handlers acknowledge in `< 3 seconds` and enforce idempotency.
- [ ] Private replies are strictly limited to **1 per comment** and triggered within **7 days**.
- [ ] Dynamic spintax or AI variation is active on all public and private message templates.
- [ ] Jitter delays (randomized 5–30s) are enabled in queue workers.
- [ ] Rate limit headers (`X-Business-Use-Case-Usage`) are actively monitored with an 80% throttle circuit breaker.
- [ ] New accounts are enrolled in the 14-day progressive warm-up schedule.
- [ ] User opt-out keywords (`STOP`, `UNSUBSCRIBE`) are honored immediately.
