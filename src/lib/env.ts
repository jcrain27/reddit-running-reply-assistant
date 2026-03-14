import { z } from "zod";

const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CRON_SECRET: blankToUndefined(z.string().min(16)),
  APP_BASE_URL: blankToUndefined(z.string().url()),
  OPENAI_API_KEY: blankToUndefined(z.string().min(1)),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_BASE_URL: blankToUndefined(z.string().url()),
  ENABLE_MODEL_SCORING: blankToUndefined(z.string()),
  REDDIT_CLIENT_ID: blankToUndefined(z.string()),
  REDDIT_CLIENT_SECRET: blankToUndefined(z.string()),
  REDDIT_USERNAME: blankToUndefined(z.string()),
  REDDIT_PASSWORD: blankToUndefined(z.string()),
  REDDIT_USER_AGENT: z.string().default("RedditRunningReplyAssistant/0.1 by JohnnyCrain"),
  SMTP_HOST: blankToUndefined(z.string()),
  SMTP_PORT: blankToUndefined(z.string()),
  SMTP_USER: blankToUndefined(z.string()),
  SMTP_PASS: blankToUndefined(z.string()),
  SMTP_SECURE: blankToUndefined(z.string()),
  NOTIFY_EMAIL_TO: blankToUndefined(z.string()),
  NOTIFY_EMAIL_FROM: blankToUndefined(z.string()),
  SLACK_WEBHOOK_URL: blankToUndefined(z.string().url()),
  ADMIN_EMAIL: blankToUndefined(z.string().email()),
  ADMIN_PASSWORD: blankToUndefined(z.string().min(8))
});

let cachedEnv: z.infer<typeof envSchema> | undefined;

export function getEnv(): z.infer<typeof envSchema> {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}
