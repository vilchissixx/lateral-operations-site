# Lateral Operations Website

Static website for Lateral Operations, focused on the Talent Sprint offer: a flat $750 founder-led recruiting project for one remote role.

Production domain:

- `https://www.lateraloperations.com`

## Local Development

This is intentionally lightweight static HTML with one Vercel serverless endpoint for newsletter signup.

To preview locally:

1. Open `index.html` directly in a browser for static-page review.
2. For newsletter endpoint testing, use Vercel local development or deploy a preview with the required environment variables configured.

Expected root files and folders:

- `index.html`
- `blog/`
- `newsletter/`
- `privacy/`
- `role-blueprint/`
- `api/newsletter.js`
- `api/role-blueprint.js`
- `assets/`
- `integrations/google-apps-script/role-blueprint-webhook.gs`
- `rss.xml`
- `vercel.json`
- `deploy-version.txt`
- `favicon.svg`

## Blog Publishing

Blog posts are stored as static HTML folders under `blog/`.

To publish a new post:

1. Create a new slug folder under `blog/`, for example `blog/new-post-title/index.html`.
2. Include title, description, category, author, publication date, reading time, canonical URL, Open Graph metadata, and `BlogPosting` structured data.
3. Add the post card to `blog/index.html`.
4. Add the post to `rss.xml`.
5. Keep the article educational. Do not invent clients, testimonials, salary claims, business results, or performance statistics.

Supported categories:

- International Hiring
- Remote Operations
- Customer Success
- Sales and Support
- Founder Operations

## Newsletter Setup

Newsletter forms post to `/api/newsletter`. The endpoint validates email and consent, checks a honeypot field, blocks suspicious fast submissions, and then calls the configured email provider server-side.

The current provider implementation is Mailchimp because it supports subscriber lists, unsubscribe links, bounced-address suppression, campaign sending, basic analytics, and consent management.

Required environment variables:

- `NEWSLETTER_PROVIDER=mailchimp`
- `MAILCHIMP_API_KEY`
- `MAILCHIMP_SERVER_PREFIX`
- `MAILCHIMP_AUDIENCE_ID`

Optional environment variables:

- `MAILCHIMP_TAGS`
- `NEWSLETTER_DOUBLE_OPT_IN`

Use `.env.example` as the placeholder template. Never commit real API keys.

## Provider Behavior

If the provider is not configured, `/api/newsletter` returns a service-unavailable error and the page displays a useful failure message. It does not pretend a subscription was saved.

By default, `NEWSLETTER_DOUBLE_OPT_IN=true`, so Mailchimp creates a pending subscriber and sends a confirmation email. Set `NEWSLETTER_DOUBLE_OPT_IN=false` only if Lateral Operations intentionally chooses single opt-in.

Every marketing email sent through the provider must include a visible unsubscribe mechanism. Subscriber deletion requests should be handled in Mailchimp and can be requested through `alberto@lateraloperations.com`.

Newsletter recipients must explicitly opt in. Do not import prospect trackers, cold-outreach leads, or HubSpot contacts into the newsletter list without explicit subscriber consent.

## Role Blueprint Lead Magnet

The Role Blueprint tool lives at `/role-blueprint/`. It helps a founder or hiring manager turn a rough job description into:

- a preliminary Role Clarity Score;
- detected responsibility categories;
- potential responsibility conflicts;
- missing information;
- hiring difficulty indicators;
- immediate recommendations;
- a full Role Blueprint with a scorecard, screening questions, interview questions, strong-answer indicators, red flags, 30/60/90-day outcomes, sourcing considerations, schedule considerations, hiring risks, and a recommended next step.

The Role Clarity Score is deterministic and practical. It must not be described as AI, scientific, predictive, guaranteed, legally authoritative, or a hiring outcome forecast.

The browser report remains visible even if lead storage or email delivery fails. The report page includes Print / Save as PDF and Copy Report controls.

### Role Blueprint Environment Variables

Required for live lead storage and delivery:

- `ROLE_BLUEPRINT_PROVIDER=webhook`
- `ROLE_BLUEPRINT_WEBHOOK_URL`
- `ROLE_BLUEPRINT_WEBHOOK_SECRET`

Optional:

- `ROLE_BLUEPRINT_RATE_LIMIT_WINDOW_MS`
- `ROLE_BLUEPRINT_RATE_LIMIT_MAX`

If the provider is missing or misconfigured, `/api/role-blueprint` still generates and returns the report, but reports `saved=false` and `emailed=false`. Do not claim storage or email delivery worked unless those fields are true.

### Zero-Cost Google Apps Script Integration

Version 1 includes a reference zero-cost integration at:

- `integrations/google-apps-script/role-blueprint-webhook.gs`

This Google Apps Script web app can:

1. receive the validated payload from the Vercel serverless endpoint;
2. verify a shared secret stored in Apps Script Properties;
3. append the lead and Role Blueprint data to a dedicated Google Sheet;
4. send the completed Role Blueprint to the submitted business email;
5. send a new-lead notification to `alberto@lateraloperations.com`;
6. return truthful `saved`, `emailed`, and `duplicate` statuses to Vercel.

Do not commit real Sheet IDs, deployment URLs, secrets, or private values.

Manual setup:

1. Create a new dedicated Google Sheet for Role Blueprint leads only.
2. Do not reuse the prospect tracker, Ayye's call tracker, HubSpot exports, Mailchimp audience exports, Gmail contacts, newsletter subscriber lists, or any cold-outreach tracker.
3. Open Extensions > Apps Script from the dedicated Sheet.
4. Paste the contents of `integrations/google-apps-script/role-blueprint-webhook.gs`.
5. In Apps Script, open Project Settings > Script Properties.
6. Add `ROLE_BLUEPRINT_WEBHOOK_SECRET` with a long random value.
7. Add `ROLE_BLUEPRINT_SHEET_ID` with the dedicated Google Sheet ID.
8. Optional: add `ROLE_BLUEPRINT_NOTIFY_EMAIL=alberto@lateraloperations.com`.
9. Optional: add `ROLE_BLUEPRINT_REPLY_TO_EMAIL=alberto@lateraloperations.com`.
10. Deploy the script as a Web app.
11. Set Execute as to the script owner.
12. Set access to the safest option that allows Vercel to POST to it. For a public web app, the shared secret is required.
13. Copy the Web app URL.
14. In Vercel, set `ROLE_BLUEPRINT_PROVIDER=webhook`.
15. In Vercel, set `ROLE_BLUEPRINT_WEBHOOK_URL` to the Web app URL.
16. In Vercel, set `ROLE_BLUEPRINT_WEBHOOK_SECRET` to the same secret stored in Apps Script Properties.
17. Redeploy or trigger a fresh Vercel deployment.

### Lead Storage

The dedicated Role Blueprint sheet stores these fields when available:

- Submission ID
- Submission timestamp
- First name
- Business email
- Company
- Company website
- Optional phone
- Job title
- Full job description
- Primary business objective
- Responsibilities
- Required experience
- Tools or industry knowledge
- Schedule
- Time-zone overlap
- Candidate regions
- Employment type
- Compensation budget
- Ideal start date
- Role Clarity Score
- Responsibility categories
- Conflicting responsibilities
- Missing information
- Hiring difficulty indicators
- Recommendations
- Full Role Blueprint
- Consent timestamp
- Lead source
- UTM source
- UTM medium
- UTM campaign
- Follow-up status
- Duplicate key

Export leads from Google Sheets with File > Download after filtering or reviewing the data. Keep exports separate from the prospect tracker, Ayye's call tracker, HubSpot, Mailchimp, newsletter subscribers, and Gmail contacts unless Alberto explicitly approves a separate operational process.

### Duplicate Submissions

The Vercel endpoint creates a unique Submission ID for every accepted submission. The Apps Script checks likely duplicates using normalized business email, company name, and job title.

Duplicates are not silently discarded. The reference script appends the new submission and marks Follow-up status as `Likely duplicate - review previous submission`.

### Email Delivery

The reference Apps Script uses Google `MailApp` to send:

- the completed Role Blueprint to the submitted business email;
- a new-lead notification to `alberto@lateraloperations.com`.

Apps Script sending depends on the Google account's daily sending quotas and permissions. If the quota is exhausted, permissions are missing, the Sheet ID is wrong, or the script errors, Vercel should show `saved` and `emailed` separately instead of one generic success message.

### Testing Role Blueprint Storage and Email

1. Submit a complete Role Blueprint from the Vercel Preview.
2. Confirm the browser shows `Report generated: Yes`.
3. Confirm the browser shows `Lead saved: Yes`.
4. Confirm the browser shows `Report email sent: Yes`.
5. Confirm the dedicated Google Sheet has the new row.
6. Confirm the submitted business email receives the report.
7. Confirm `alberto@lateraloperations.com` receives the new-lead notification.
8. Submit the same business email, company, and job title again.
9. Confirm the duplicate is stored and marked for review.

### Disable Role Blueprint Capture Safely

To disable storage and email delivery, remove `ROLE_BLUEPRINT_PROVIDER`, `ROLE_BLUEPRINT_WEBHOOK_URL`, or `ROLE_BLUEPRINT_WEBHOOK_SECRET` from Vercel and redeploy. The report will still display in the browser, but the app will truthfully show that lead storage and report email delivery did not complete.

To hide the tool entirely, remove or hide links to `/role-blueprint/` and leave `/api/role-blueprint` unconfigured. Do not route Role Blueprint submissions into newsletter, HubSpot, Gmail, Mailchimp, or prospecting systems automatically.

### Rotate the Webhook Secret

1. Generate a new long random secret.
2. Update `ROLE_BLUEPRINT_WEBHOOK_SECRET` in Apps Script Properties.
3. Update `ROLE_BLUEPRINT_WEBHOOK_SECRET` in Vercel.
4. Redeploy Vercel.
5. Submit a test Role Blueprint.
6. Confirm the old secret no longer works by attempting only a controlled test from a secure environment.

## Deployment

The site deploys on Vercel.

Deployment steps:

1. Open a pull request from a feature branch.
2. Review the Vercel preview deployment.
3. Add the newsletter environment variables in Vercel for preview and production.
4. Confirm `/api/newsletter` works in the preview environment.
5. Merge only after approval.

To disable the newsletter safely, remove or hide the forms and leave `/api/newsletter` unconfigured. The endpoint will fail closed instead of storing fake subscriptions.
