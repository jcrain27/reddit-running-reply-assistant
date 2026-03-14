import { IncomingWebhook } from "@slack/webhook";
import nodemailer from "nodemailer";

import { getEnv } from "@/lib/env";
import type { NotificationDispatchResult } from "@/lib/types";
import { truncate } from "@/lib/utils";

interface NotifyInput {
  candidate: {
    id: string;
    subreddit: string;
    title: string;
    permalink: string;
    selectedReason: string;
    priorityScore: number;
  };
  draft: {
    draftText: string;
  };
  appSettings: {
    notificationEmailEnabled: boolean;
    notificationSlackEnabled: boolean;
    notificationEmailTo: string | null;
    notificationSlackWebhookUrl: string | null;
  };
}

interface ReplyNotifyInput {
  replyCandidate: {
    id: string;
    subreddit: string;
    author: string;
    permalink: string;
    parentPostTitle: string;
    selectedReason: string;
    priorityScore: number;
  };
  draft: {
    draftText: string;
  };
  appSettings: {
    notificationEmailEnabled: boolean;
    notificationSlackEnabled: boolean;
    notificationEmailTo: string | null;
    notificationSlackWebhookUrl: string | null;
  };
}

export async function dispatchNotifications(
  input: NotifyInput
): Promise<NotificationDispatchResult[]> {
  const env = getEnv();
  const results: NotificationDispatchResult[] = [];
  const appBaseUrl = env.APP_BASE_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appBaseUrl}/candidates/${input.candidate.id}`;
  const preview = truncate(input.draft.draftText, 180);
  const subject = `[RRRA] ${input.candidate.subreddit}: ${truncate(input.candidate.title, 72)}`;

  if (input.appSettings.notificationEmailEnabled) {
    try {
      if (!env.SMTP_HOST || !env.SMTP_PORT || !env.NOTIFY_EMAIL_FROM) {
        throw new Error("SMTP_HOST, SMTP_PORT, and NOTIFY_EMAIL_FROM must be set.");
      }

      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT),
        secure: env.SMTP_SECURE === "true",
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
              }
            : undefined
      });

      await transporter.sendMail({
        from: env.NOTIFY_EMAIL_FROM,
        to: input.appSettings.notificationEmailTo || env.NOTIFY_EMAIL_TO,
        subject,
        text: [
          `Subreddit: r/${input.candidate.subreddit}`,
          `Priority: ${input.candidate.priorityScore}`,
          `Reason: ${input.candidate.selectedReason}`,
          `Reddit: ${input.candidate.permalink}`,
          `Dashboard: ${dashboardUrl}`,
          "",
          `Draft preview: ${preview}`
        ].join("\n")
      });

      results.push({ channel: "EMAIL", success: true });
    } catch (error) {
      results.push({
        channel: "EMAIL",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown email error"
      });
    }
  }

  if (input.appSettings.notificationSlackEnabled) {
    try {
      const webhookUrl =
        input.appSettings.notificationSlackWebhookUrl || env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error("SLACK_WEBHOOK_URL is not configured.");
      }

      const webhook = new IncomingWebhook(webhookUrl);
      await webhook.send({
        text: subject,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*r/${input.candidate.subreddit}* - ${input.candidate.title}`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Reason:* ${input.candidate.selectedReason}\n*Priority:* ${input.candidate.priorityScore}\n*Preview:* ${preview}`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Reddit"
                },
                url: input.candidate.permalink
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Dashboard"
                },
                url: dashboardUrl
              }
            ]
          }
        ]
      });

      results.push({ channel: "SLACK", success: true });
    } catch (error) {
      results.push({
        channel: "SLACK",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown Slack error"
      });
    }
  }

  return results;
}

export async function dispatchReplyNotifications(
  input: ReplyNotifyInput
): Promise<NotificationDispatchResult[]> {
  const env = getEnv();
  const results: NotificationDispatchResult[] = [];
  const appBaseUrl = env.APP_BASE_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appBaseUrl}/replies/${input.replyCandidate.id}`;
  const preview = truncate(input.draft.draftText, 180);
  const subject = `[RRRA Reply] r/${input.replyCandidate.subreddit}: ${truncate(input.replyCandidate.parentPostTitle, 72)}`;

  if (input.appSettings.notificationEmailEnabled) {
    try {
      if (!env.SMTP_HOST || !env.SMTP_PORT || !env.NOTIFY_EMAIL_FROM) {
        throw new Error("SMTP_HOST, SMTP_PORT, and NOTIFY_EMAIL_FROM must be set.");
      }

      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT),
        secure: env.SMTP_SECURE === "true",
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
              }
            : undefined
      });

      await transporter.sendMail({
        from: env.NOTIFY_EMAIL_FROM,
        to: input.appSettings.notificationEmailTo || env.NOTIFY_EMAIL_TO,
        subject,
        text: [
          `Subreddit: r/${input.replyCandidate.subreddit}`,
          `Reply author: ${input.replyCandidate.author}`,
          `Priority: ${input.replyCandidate.priorityScore}`,
          `Reason: ${input.replyCandidate.selectedReason}`,
          `Reddit: ${input.replyCandidate.permalink}`,
          `Dashboard: ${dashboardUrl}`,
          "",
          `Draft preview: ${preview}`
        ].join("\n")
      });

      results.push({ channel: "EMAIL", success: true });
    } catch (error) {
      results.push({
        channel: "EMAIL",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown email error"
      });
    }
  }

  if (input.appSettings.notificationSlackEnabled) {
    try {
      const webhookUrl =
        input.appSettings.notificationSlackWebhookUrl || env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error("SLACK_WEBHOOK_URL is not configured.");
      }

      const webhook = new IncomingWebhook(webhookUrl);
      await webhook.send({
        text: subject,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Reply to your comment in r/${input.replyCandidate.subreddit}*\n${input.replyCandidate.parentPostTitle}`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Reply author:* ${input.replyCandidate.author}\n*Reason:* ${input.replyCandidate.selectedReason}\n*Preview:* ${preview}`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Reddit"
                },
                url: input.replyCandidate.permalink
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Reply Queue"
                },
                url: dashboardUrl
              }
            ]
          }
        ]
      });

      results.push({ channel: "SLACK", success: true });
    } catch (error) {
      results.push({
        channel: "SLACK",
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown Slack error"
      });
    }
  }

  return results;
}
