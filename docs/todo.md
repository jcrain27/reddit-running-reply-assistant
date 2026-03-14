# Manual TODOs

## Credentials and setup

- Create a Reddit app and confirm the OAuth flow you want to use for server-side fetches and optional comment submission.
- Decide whether you want public-read-only fetches for scanning or fully authenticated fetches from day one.
- Generate strong production values for `SESSION_SECRET` and `CRON_SECRET`.
- Decide which notification channels are live for v1: SMTP email, Slack, or both.
- Choose the actual OpenAI model name you want to use in production.

## Policy and moderation review

- Review Reddit API terms and rate-limit expectations for your app credentials.
- Review each seeded subreddit’s rules before enabling CTA suggestions or direct submit.
- Confirm which subreddits should remain `strictNoPromo = true`.
- Decide whether advanced or medical-adjacent subreddits should have stricter reply-length or caution thresholds.
- Confirm the exact wording Johnny is comfortable using when mentioning coaching or business context.

## Product decisions for first launch

- Decide whether copy-only should remain the default for all subreddits at launch.
- Decide what qualifies as a “high-priority” notification score for Johnny in practice.
- Add real Johnny voice examples from past Reddit comments, emails, or coaching notes.
- Review the default banned phrase list and add any phrasing Johnny never wants in a draft.
- Review the medical-risk keyword list with a conservative bias before enabling broad scanning.

## Future improvements

- Add thread-context fetching for better reply drafting.
- Pull engagement metrics after submission if Reddit API access and rate limits allow it.
- Use stored edit behavior to refine prompts automatically in a later version.
- Add semantic duplicate detection beyond token overlap for repeated draft patterns.
- Add a weekly digest summarizing approvals, skips, and best-performing subreddits.
