# Reddit Running Reply Assistant

Private, single-user, human-in-the-loop Reddit reply drafting for Johnny Crain at RunFitCoach.

## What v1 includes

- Next.js app-router dashboard with login, inbox, candidate detail, settings, and analytics.
- Postgres + Prisma schema, migration, and seed data.
- A scan pipeline that fetches recent posts from configured subreddits, scores them, drafts replies, runs safety checks, and notifies Johnny for high-priority items.
- Human review flow with edit, copy-only tracking, skip/archive actions, and optional direct Reddit submit behind a feature flag.
- Email and Slack notification support.
- Basic analytics around candidate volume, approvals, copy usage, CTA usage, and edit behavior.
- Subreddit-specific rule support for banned phrases, medical keywords, skip keywords, style hints, reply style, and CTA guidance.
- Focused tests for scoring and safety logic.

## Stack

- Frontend: Next.js + TypeScript
- Backend: Next.js route handlers
- Database: Postgres
- ORM: Prisma
- Auth: simple password login with signed session cookie
- Scheduler: Render cron or local CLI entrypoint
- Notifications: SMTP email and Slack webhook
- LLM: OpenAI API

## Project structure

```text
src/app                  App router pages and API routes
src/components           Client/server UI components
src/lib                  Auth, DB, constants, utilities
src/lib/services         Reddit, scoring, drafting, safety, scan orchestration, notifications
src/lib/repositories     Shared Prisma query helpers
prisma                   Schema, SQL migration, seed script
scripts/run-scan.ts      Cron-friendly scan entrypoint
docs                     Render deployment notes and manual TODOs
```

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the env template and fill in secrets:

```bash
cp .env.example .env
```

3. Run the migration and seed the single-user admin account:

```bash
npm run prisma:migrate:deploy
npm run prisma:seed
```

4. Start the app:

```bash
npm run dev
```

5. Optional: run a scan manually from the terminal:

```bash
npm run cron:scan
```

## Core workflow

1. Render cron or the manual scan trigger runs every 15 minutes.
2. The scan fetches recent posts from enabled subreddits.
3. Posts are deduplicated and scored for advice intent, relevance, engagement, promo risk, and medical risk.
4. Qualified posts get a draft, alternate draft, optional CTA suggestion, and safety validation.
5. High-priority candidates trigger email and/or Slack notifications.
6. Johnny reviews in the dashboard, edits if needed, copies manually, or explicitly approves direct submit.
7. Edit behavior and outcomes are stored for analytics and future prompt tuning.

## Important environment variables

- `DATABASE_URL`: Postgres connection string.
- `SESSION_SECRET`: HMAC secret for signed login cookies.
- `CRON_SECRET`: Optional secret for calling `POST /api/scan/run` from Render or another scheduler.
- `APP_BASE_URL`: Base URL used in notification deep links.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Seed-time credentials for Johnny’s login.
- `OPENAI_API_KEY`: Enables model-based drafting.
- `OPENAI_MODEL`: Draft model name. Adjust to an allowed model in your OpenAI account.
- `ENABLE_MODEL_SCORING`: Optional `true` to use model-assisted scoring before drafting.
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`: Needed for authenticated Reddit access and direct submit.
- `SMTP_*`, `NOTIFY_EMAIL_*`, `SLACK_WEBHOOK_URL`: Notification channels.

## Direct submit behavior

- Disabled by default at the app level.
- Also must be enabled per subreddit.
- Still requires Johnny to click `Approve and Submit`.
- Stores the returned Reddit comment id when successful.
- Records failure details without crashing the rest of the app.

## Safety posture

- Human approval is the default workflow.
- CTA suggestions are optional and blank most of the time.
- Draft validation checks for banned phrases, repetition, promotion risk, medical certainty, and length.
- High-medical-risk posts are filtered out before drafting when they cross the subreddit strictness threshold.
- Injury/medical replies should remain cautious and point toward professional care when appropriate.

## Supported subreddit rule types

Rules are stored as `subreddit|ruleType|ruleValue` rows from the Settings page.

- `banned_phrase`
- `medical_keyword`
- `skip_keyword`
- `required_keyword`
- `advice_boost_keyword`
- `relevance_keyword`
- `style_hint`
- `default_reply_style`
- `cta_style`

## Testing

Run the focused unit tests with:

```bash
npm test
```

## Render deployment

Render notes live in [docs/render-deploy.md](./docs/render-deploy.md).

There is also a root-level [`render.yaml`](./render.yaml) Blueprint spec for creating the web
service and cron job together on Render.

## Manual follow-up items

Credential and policy TODOs live in [docs/todo.md](./docs/todo.md).
