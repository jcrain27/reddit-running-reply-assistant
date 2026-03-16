import {
  CandidateStatus,
  DraftFinalAction,
  NotificationChannel,
  NotificationPriority,
  ScanStatus
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getCandidateDetail } from "@/lib/repositories/candidateRepository";
import { DEFAULT_PROMPT_VERSIONS, MAX_RECENT_DRAFTS_FOR_SIMILARITY } from "@/lib/constants";
import { generateDraft } from "@/lib/services/draftService";
import { processTrackedCommentReplies } from "@/lib/services/commentReplyService";
import { dispatchNotifications } from "@/lib/services/notificationService";
import { getSubredditPreferenceAdjustments } from "@/lib/services/preferenceService";
import { fetchLatestPosts } from "@/lib/services/redditClient";
import { validateDraft } from "@/lib/services/safetyService";
import { scorePostCandidate } from "@/lib/services/scoringService";
import { getAppSettings, getEnabledSubredditConfigs } from "@/lib/services/settingsService";
import {
  buildEffectiveSubredditSettings,
  findRuleSkipReasonForPost
} from "@/lib/services/subredditRulesService";
import type { ScanJobResult } from "@/lib/types";

export async function runScanJob(triggeredBy = "manual"): Promise<ScanJobResult & { scanRunId: string }> {
  const scanRun = await prisma.scanRun.create({
    data: {
      startedAt: new Date(),
      status: ScanStatus.RUNNING,
      triggeredBy
    }
  });

  const result: ScanJobResult = {
    scannedCount: 0,
    candidateCount: 0,
    draftedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    notes: []
  };

  try {
    const [appSettings, subreddits, voiceExamples, recentDrafts, preferenceAdjustments] = await Promise.all([
      getAppSettings(),
      getEnabledSubredditConfigs(),
      prisma.voiceExample.findMany({
        where: { enabled: true },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.draftReply.findMany({
        orderBy: { createdAt: "desc" },
        take: MAX_RECENT_DRAFTS_FOR_SIMILARITY,
        select: {
          draftText: true,
          optionalCTAText: true,
          openingLine: true
        }
      }),
      getSubredditPreferenceAdjustments()
    ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let draftsToday = await prisma.draftReply.count({
      where: {
        createdAt: {
          gte: startOfDay
        }
      }
    });

    const subredditDailyCounts = new Map<string, number>();
    let dailyCapReached = false;

    for (const subreddit of subreddits) {
      const count = await prisma.postCandidate.count({
        where: {
          subreddit: subreddit.name,
          createdAt: {
            gte: startOfDay
          },
          status: {
            not: CandidateStatus.ARCHIVED
          }
        }
      });

      subredditDailyCounts.set(subreddit.name, count);
    }

    for (const subreddit of subreddits) {
      if (dailyCapReached) {
        break;
      }

      try {
        const effectiveSubreddit = buildEffectiveSubredditSettings({
          config: subreddit,
          appSettings: {
            bannedPhrases: appSettings.bannedPhrases as string[],
            medicalRiskKeywords: appSettings.medicalRiskKeywords as string[]
          }
        });
        const posts = await fetchLatestPosts(subreddit.name, 20);
        result.scannedCount += posts.length;

        for (const post of posts) {
          let candidateId: string | null = null;

          try {
            if (
              !post.title ||
              post.title === "[deleted]" ||
              post.selftext === "[removed]" ||
              post.removedByCategory
            ) {
              result.skippedCount += 1;
              continue;
            }

            const existing = await prisma.postCandidate.findUnique({
              where: { redditPostId: post.id },
              select: { id: true }
            });

            if (existing) {
              result.skippedCount += 1;
              continue;
            }

            if (draftsToday >= appSettings.maxSuggestedRepliesPerDay) {
              result.notes.push("Reached the daily draft cap.");
              dailyCapReached = true;
              break;
            }

            const subredditCount = subredditDailyCounts.get(subreddit.name) ?? 0;
            if (subredditCount >= subreddit.maxRepliesPerDay) {
              result.skippedCount += 1;
              continue;
            }

            const ruleSkipReason = findRuleSkipReasonForPost(post, effectiveSubreddit);
            if (ruleSkipReason) {
              result.skippedCount += 1;
              continue;
            }

            const score = await scorePostCandidate({
              post,
              config: subreddit,
              appSettings: {
                maxPostAgeHours: appSettings.maxPostAgeHours,
                minAdviceScore: appSettings.minAdviceScore,
                notificationThreshold: appSettings.notificationThreshold,
                medicalRiskKeywords: effectiveSubreddit.medicalRiskKeywords,
                adviceBoostKeywords: effectiveSubreddit.adviceBoostKeywords,
                relevanceBoostKeywords: effectiveSubreddit.relevanceKeywords,
                preferenceAdjustment: preferenceAdjustments.get(subreddit.name) ?? 0
              }
            });

            if (!score.shouldDraft) {
              result.skippedCount += 1;
              continue;
            }

            const candidate = await prisma.postCandidate.create({
              data: {
                redditPostId: post.id,
                thingId: post.name,
                subreddit: post.subreddit.toLowerCase(),
                title: post.title,
                author: post.author,
                permalink: post.permalink,
                url: post.url,
                bodyText: post.selftext || "",
                createdUtc: new Date(post.createdUtc * 1000),
                fetchedAt: new Date(),
                score: post.score,
                numComments: post.numComments,
                adviceScore: score.adviceScore,
                relevanceScore: score.relevanceScore,
                engagementScore: score.engagementScore,
                priorityScore: score.priorityScore,
                promoRiskScore: score.promoRiskScore,
                medicalRiskScore: score.medicalRiskScore,
                selectedReason: score.selectedReason,
                notificationPriority:
                  score.priority === "HIGH"
                    ? NotificationPriority.HIGH
                    : score.priority === "NORMAL"
                      ? NotificationPriority.NORMAL
                      : NotificationPriority.LOW
              }
            });

            candidateId = candidate.id;
            result.candidateCount += 1;

            const initialDraft = await generateDraft({
              post,
              config: subreddit,
              appSettings: {
                enableCTASuggestions: appSettings.enableCTASuggestions
              },
              voiceExamples,
              ruleContext: effectiveSubreddit,
              recentDrafts
            });

            let draftToUse = initialDraft;
            let safety = validateDraft({
              draftText: initialDraft.coreReply,
              optionalCTA: initialDraft.optionalCTA,
              recentDrafts,
              bannedPhrases: effectiveSubreddit.bannedPhrases,
              maxReplyLength: subreddit.maxReplyLength
            });

            if (!safety.approved) {
              const regenerated = await generateDraft({
                post,
                config: subreddit,
                appSettings: {
                  enableCTASuggestions: appSettings.enableCTASuggestions
                },
                voiceExamples,
                ruleContext: effectiveSubreddit,
                recentDrafts,
                toneVariant: score.medicalRiskScore > 40 ? "cautious" : "alternate"
              });

              const regeneratedSafety = validateDraft({
                draftText: regenerated.coreReply,
                optionalCTA: regenerated.optionalCTA,
                recentDrafts,
                bannedPhrases: effectiveSubreddit.bannedPhrases,
                maxReplyLength: subreddit.maxReplyLength
              });

              if (regeneratedSafety.approved) {
                draftToUse = regenerated;
                safety = regeneratedSafety;
              }
            }

            await prisma.draftReply.create({
              data: {
                postCandidateId: candidate.id,
                modelName: draftToUse.modelName,
                systemPromptVersion: DEFAULT_PROMPT_VERSIONS.system,
                userPromptVersion: DEFAULT_PROMPT_VERSIONS.user,
                draftText: draftToUse.coreReply,
                alternateDraftText: draftToUse.alternateReply,
                optionalCTAText: draftToUse.optionalCTA,
                ctaAllowed:
                  appSettings.enableCTASuggestions &&
                  subreddit.allowCTA &&
                  !subreddit.strictNoPromo,
                confidence: draftToUse.confidence,
                generationReasoning: draftToUse.reasoning,
                safetyWarnings: safety.warnings,
                openingLine: safety.openingLine,
                duplicateRiskScore: safety.duplicateRiskScore,
                promotionalRiskScore: safety.promotionalRiskScore,
                medicalCertaintyRiskScore: safety.medicalCertaintyRiskScore,
                finalAction: DraftFinalAction.NONE
              }
            });

            await prisma.postCandidate.update({
              where: { id: candidate.id },
              data: {
                status: safety.approved ? CandidateStatus.DRAFTED : CandidateStatus.REVIEWED
              }
            });

            recentDrafts.unshift({
              draftText: draftToUse.coreReply,
              optionalCTAText: draftToUse.optionalCTA,
              openingLine: safety.openingLine
            });
            recentDrafts.splice(MAX_RECENT_DRAFTS_FOR_SIMILARITY);

            result.draftedCount += 1;
            draftsToday += 1;
            subredditDailyCounts.set(subreddit.name, subredditCount + 1);

            if (score.priority === "HIGH") {
              const refreshedCandidate = await getCandidateDetail(candidate.id);
              const latestDraft = refreshedCandidate?.draftReplies[0];

              if (refreshedCandidate && latestDraft) {
                const notificationResults = await dispatchNotifications({
                  candidate: {
                    id: refreshedCandidate.id,
                    subreddit: refreshedCandidate.subreddit,
                    title: refreshedCandidate.title,
                    permalink: refreshedCandidate.permalink,
                    selectedReason: refreshedCandidate.selectedReason,
                    priorityScore: refreshedCandidate.priorityScore
                  },
                  draft: {
                    draftText: latestDraft.humanEditedText || latestDraft.draftText
                  },
                  appSettings: {
                    notificationEmailEnabled: appSettings.notificationEmailEnabled,
                    notificationSlackEnabled: appSettings.notificationSlackEnabled,
                    notificationEmailTo: appSettings.notificationEmailTo,
                    notificationSlackWebhookUrl: appSettings.notificationSlackWebhookUrl
                  }
                });

                for (const entry of notificationResults) {
                  await prisma.notificationEvent.create({
                    data: {
                      postCandidateId: refreshedCandidate.id,
                      channel:
                        entry.channel === "EMAIL"
                          ? NotificationChannel.EMAIL
                          : NotificationChannel.SLACK,
                      success: entry.success,
                      errorMessage: entry.errorMessage ?? null
                    }
                  });
                }
              }
            }
          } catch (error) {
            result.errorCount += 1;
            result.notes.push(
              `Post error in r/${subreddit.name}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );

            if (candidateId) {
              await prisma.postCandidate.update({
                where: { id: candidateId },
                data: {
                  status: CandidateStatus.FAILED
                }
              });
            }
          }
        }
      } catch (error) {
        result.errorCount += 1;
        result.notes.push(
          `Subreddit fetch failed for r/${subreddit.name}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    const replyScanResult = await processTrackedCommentReplies();
    if (replyScanResult.createdCandidates > 0 || replyScanResult.notes.length > 0) {
      result.notes.push(
        `Comment reply scan: ${replyScanResult.scannedReplies} replies checked, ${replyScanResult.createdCandidates} candidates created, ${replyScanResult.draftedReplies} drafts generated.`
      );
      result.notes.push(...replyScanResult.notes);
    }

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        finishedAt: new Date(),
        scannedCount: result.scannedCount,
        candidateCount: result.candidateCount,
        draftedCount: result.draftedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        notes: result.notes.join("\n"),
        status: result.errorCount > 0 ? ScanStatus.PARTIAL_FAILURE : ScanStatus.SUCCESS
      }
    });
  } catch (error) {
    result.errorCount += 1;
    result.notes.push(error instanceof Error ? error.message : "Unknown scan failure");

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        finishedAt: new Date(),
        scannedCount: result.scannedCount,
        candidateCount: result.candidateCount,
        draftedCount: result.draftedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        notes: result.notes.join("\n"),
        status: ScanStatus.FAILED
      }
    });
  }

  return {
    ...result,
    scanRunId: scanRun.id
  };
}
