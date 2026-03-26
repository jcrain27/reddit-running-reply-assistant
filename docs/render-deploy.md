# Render deployment notes

## Recommended path

Use the root-level [`render.yaml`](../render.yaml) if you want Render to create both the web
service and the cron job from one Blueprint sync.

If you already created the Postgres database manually, keep using that existing database and
enter its internal connection string for `DATABASE_URL` during the Blueprint setup flow.

## Services

Create these Render resources:

1. Web service
   - Runtime: Node
   - Build command: `npm install && npm run render-build`
   - Start command: `npm run start`
   - Auto-deploy: enabled

2. Cron job
   - Runtime: Node
   - Schedule: every 15 minutes
   - Build command: `npm install && npm run prisma:generate`
   - Start command: `npm run cron:scan`

3. Postgres
   - Create a managed Postgres instance
   - Set the same `DATABASE_URL` on both the web service and cron job

## Shared environment variables

Set these on both the web service and the cron job:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`
- `REDDIT_USER_AGENT`
- `SESSION_SECRET`
- `APP_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `NOTIFY_EMAIL_FROM`
- `NOTIFY_EMAIL_TO`
- `SLACK_WEBHOOK_URL`

Web service only:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Optional if you want to trigger scans over HTTP as well:

- `CRON_SECRET`

## Initial deployment order

1. Provision Postgres.
2. Add environment variables.
3. Deploy the web service.
4. Run:
   - `npm run prisma:migrate:deploy`
   - `npm run prisma:seed`
5. Log into the dashboard and review settings.
6. Enable the cron job after the first successful manual scan.

## GitHub first

Render deploys this app from a Git repository. If this project is only local right now:

1. Create an empty GitHub repo.
2. Add it as the remote.
3. Push the `main` branch.
4. Then connect that repo in Render.

## Seeding production

After the web service deploys successfully, seed the production database once with either:

- a Render Shell session on the web service running `npm run prisma:seed`
- or a one-off job based on the web service running `npm run prisma:seed`

Render's current docs for shell access and one-off jobs:

- [SSH and Shell Access](https://render.com/docs/ssh)
- [One-Off Jobs](https://render.com/docs/one-off-jobs)

## Production notes

- Keep direct Reddit submit disabled until you have validated subreddit-specific settings and moderation expectations.
- If you want the cron job to hit the API instead of running `npm run cron:scan`, point it to `POST /api/scan/run` and send `x-cron-secret`.
- The UI has a configurable scan frequency field, but Render should stay on a fixed 15-minute schedule for v1.
- Set `APP_BASE_URL` to the public Render URL so Slack/email notifications deep-link back into the dashboard.
- The weekly RunFitCoach blog sync happens inside the normal scan job, so the cron job does not need a second schedule for blog updates.
