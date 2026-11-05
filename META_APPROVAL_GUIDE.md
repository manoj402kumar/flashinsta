# Meta App Approval & Review Guide: Instagram Automation Platform

> **Full Blueprint:** See [`08-META-APP-REVIEW-AND-BUSINESS-VERIFICATION-GUIDE.md`](../instagram-automation-architecture/08-META-APP-REVIEW-AND-BUSINESS-VERIFICATION-GUIDE.md) in `Desktop/instagram-automation-architecture/`.

This document is the operational guide to take the **"Connect with Instagram"** button from Development Mode (restricted to manual testers) to **Live Mode** (publicly available for all creators & businesses).

---

## 1. Quick Action Checklist

- [ ] **Meta Business Verification:**
  - Submit Certificate of Incorporation / GST / Tax ID proof in [business.facebook.com](https://business.facebook.com) (Security Center).
  - Match company legal name and address letter-for-letter.
  - Verify corporate domain using DNS TXT record.
  - Verify domain email (`admin@yourdomain.com`).
- [ ] **Legal Endpoints Live on Production Domain:**
  - `/privacy` with explicit Instagram Graph API data clauses.
  - `/terms` with acceptable use policy.
  - `/data-deletion` (or API callback `/api/privacy/data-deletion`) configured in Meta App Settings.
  - App Icon (1024 × 1024 px PNG) uploaded.
- [ ] **App Review Permissions Selected:**
  - `instagram_business_basic`
  - `instagram_business_manage_messages`
  - `instagram_business_manage_comments`
- [ ] **Screencast Video (MP4, 1080p, 2–4 mins):**
  - Shows browser URL bar on production domain.
  - Shows clicking "Connect with Instagram".
  - Shows official Meta OAuth consent screen (`www.instagram.com/oauth/authorize`) with visible App Name and requested permissions.
  - Shows redirect to dashboard.
  - Shows creating an automation rule (Keyword + DM + Comment Reply).
  - Shows live test from a separate Instagram account commenting the keyword.
  - Shows the public reply on the Reel and the private DM received in the Instagram inbox.
- [ ] **Reviewer Instructions & Credentials Submitted:**
  - Clear English instructions with staging credentials without MFA.
- [ ] **Toggle App to Live Mode:**
  - Flip the switch in the Meta Developer Dashboard header once permissions are approved.

---

For exact copy-paste permission justifications, video storyboard script, reviewer submission templates, and troubleshooting common rejections, refer to the full specification:  
[`08-META-APP-REVIEW-AND-BUSINESS-VERIFICATION-GUIDE.md`](../instagram-automation-architecture/08-META-APP-REVIEW-AND-BUSINESS-VERIFICATION-GUIDE.md).
