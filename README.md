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
- `api/newsletter.js`
- `assets/`
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

## Deployment

The site deploys on Vercel.

Deployment steps:

1. Open a pull request from a feature branch.
2. Review the Vercel preview deployment.
3. Add the newsletter environment variables in Vercel for preview and production.
4. Confirm `/api/newsletter` works in the preview environment.
5. Merge only after approval.

To disable the newsletter safely, remove or hide the forms and leave `/api/newsletter` unconfigured. The endpoint will fail closed instead of storing fake subscriptions.
