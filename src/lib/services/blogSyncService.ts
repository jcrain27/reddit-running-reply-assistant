import { BlogSyncStatus, Prisma, type BlogPost } from "@prisma/client";

import { APP_NAME } from "@/lib/constants";
import { prisma } from "@/lib/db";
import type { BlogRecommendation } from "@/lib/types";
import {
  calculateTextSimilarity,
  clamp,
  decodeHtmlEntities,
  escapeRegExp,
  normalizeWhitespace,
  tokenize,
  truncate
} from "@/lib/utils";

export const RUNFITCOACH_BLOG_FEED_URL = "https://www.runfitcoach.com/blog?format=rss";
export const BLOG_SYNC_INTERVAL_DAYS = 7;
const BLOG_MATCH_THRESHOLD = 0.18;
const MAX_CONTENT_LENGTH = 12_000;
const MAX_SUMMARY_LENGTH = 650;
const MAX_MATCH_KEYWORDS = 12;
const BLOG_MATCH_LOOKBACK = 40;

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "back",
  "been",
  "being",
  "best",
  "because",
  "before",
  "between",
  "both",
  "does",
  "doing",
  "down",
  "from",
  "have",
  "help",
  "into",
  "just",
  "more",
  "most",
  "over",
  "really",
  "some",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "using",
  "very",
  "want",
  "what",
  "when",
  "with",
  "your"
]);

export interface ParsedBlogFeedItem {
  title: string;
  url: string;
  author?: string;
  publishedAt: Date;
  summaryText: string;
  contentText: string;
  matchKeywords: string[];
}

export interface BlogSyncSummary {
  skipped: boolean;
  feedUrl: string;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  finishedAt: Date | null;
  message: string;
}

export interface BlogKnowledgeSummary {
  feedUrl: string;
  blogPostCount: number;
  lastSyncAt: Date | null;
  lastSyncStatus: BlogSyncStatus | null;
}

function unwrapCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function normalizeFeedUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function extractXmlTag(block: string, tagName: string) {
  const pattern = new RegExp(
    `<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`,
    "i"
  );
  const match = block.match(pattern);
  return match ? unwrapCdata(match[1]) : null;
}

export function stripHtmlToText(value: string) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<figure\b[\s\S]*?<\/figure>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|h1|h2|h3|li|ol|ul)>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function meaningfulTokens(value: string | string[]) {
  const tokens = Array.isArray(value) ? value : tokenize(value);
  return tokens.filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function extractSummary(contentText: string) {
  const sentences = contentText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  const summary = sentences.slice(0, 3).join(" ");
  return truncate(summary || contentText, MAX_SUMMARY_LENGTH);
}

function deriveMatchKeywords(title: string, contentText: string) {
  const counts = new Map<string, number>();

  for (const token of meaningfulTokens(`${title} ${contentText}`)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_MATCH_KEYWORDS)
    .map(([token]) => token);
}

function parsePublishedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function slugFromUrl(url: string) {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/+|\/+$/g, "") || parsed.hostname;
}

function toKeywordArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

export function parseBlogFeed(xml: string): ParsedBlogFeedItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const parsedItems: Array<ParsedBlogFeedItem | null> = items.map((match) => {
    const block = match[1];
    const title = normalizeWhitespace(decodeHtmlEntities(extractXmlTag(block, "title") || ""));
    const url = normalizeFeedUrl(extractXmlTag(block, "link") || "");
    const author = normalizeWhitespace(decodeHtmlEntities(extractXmlTag(block, "dc:creator") || ""));
    const publishedAt = parsePublishedDate(extractXmlTag(block, "pubDate"));
    const description = extractXmlTag(block, "description") || "";
    const contentText = truncate(stripHtmlToText(description), MAX_CONTENT_LENGTH);
    const summaryText = extractSummary(contentText);

    if (!title || !url || !publishedAt || !contentText) {
      return null;
    }

    return {
      title,
      url,
      author: author || undefined,
      publishedAt,
      summaryText,
      contentText,
      matchKeywords: deriveMatchKeywords(title, contentText)
    };
  });

  return parsedItems.filter((item): item is ParsedBlogFeedItem => item !== null);
}

function buildBlogReason(
  _blog: Pick<BlogPost, "title" | "url" | "summaryText">,
  overlappingTokens: string[],
  matchScore: number
) {
  if (overlappingTokens.length) {
    return `Strong topic overlap on ${overlappingTokens.slice(0, 3).join(", ")}.`;
  }

  if (matchScore >= 0.3) {
    return `This article is a strong fit for the thread's main training question.`;
  }

  return `This article gives Johnny a fuller read-more resource if the reply needs it.`;
}

export function recommendBlogPost(input: {
  postTitle: string;
  postBodyText?: string;
  blogPosts: Array<
    Pick<BlogPost, "id" | "title" | "url" | "summaryText" | "contentText" | "publishedAt" | "matchKeywords">
  >;
}): BlogRecommendation | null {
  const combinedText = normalizeWhitespace(`${input.postTitle} ${input.postBodyText || ""}`);
  const inputTokens = new Set(meaningfulTokens(combinedText));

  if (!combinedText || !input.blogPosts.length || !inputTokens.size) {
    return null;
  }

  const ranked = input.blogPosts
    .map((blog) => {
      const titleTokens = new Set(meaningfulTokens(blog.title));
      const summaryTokens = new Set(
        meaningfulTokens(`${blog.summaryText} ${blog.contentText.slice(0, 1200)} ${toKeywordArray(blog.matchKeywords).join(" ")}`)
      );
      const overlappingTokens = [...inputTokens].filter(
        (token) => titleTokens.has(token) || summaryTokens.has(token)
      );
      const titleOverlap =
        overlappingTokens.filter((token) => titleTokens.has(token)).length / Math.max(titleTokens.size, 1);
      const summaryOverlap =
        overlappingTokens.filter((token) => summaryTokens.has(token)).length /
        Math.max(summaryTokens.size, 1);
      const similarity = calculateTextSimilarity(
        combinedText,
        `${blog.title} ${blog.summaryText} ${toKeywordArray(blog.matchKeywords).join(" ")}`
      );
      const recencyDays = (Date.now() - blog.publishedAt.getTime()) / 86_400_000;
      const recencyBoost = recencyDays <= 45 ? 0.05 : recencyDays <= 120 ? 0.02 : 0;
      const titlePhraseBonus = combinedText.toLowerCase().includes(blog.title.toLowerCase()) ? 0.2 : 0;
      const matchScore = clamp(
        similarity * 0.35 + titleOverlap * 0.32 + summaryOverlap * 0.23 + recencyBoost + titlePhraseBonus,
        0,
        1
      );

      return {
        blog,
        matchScore,
        overlappingTokens
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore);

  const best = ranked[0];

  if (!best || best.matchScore < BLOG_MATCH_THRESHOLD) {
    return null;
  }

  return {
    id: best.blog.id,
    title: best.blog.title,
    url: best.blog.url,
    summaryText: best.blog.summaryText,
    matchScore: Number(best.matchScore.toFixed(2)),
    reason: buildBlogReason(best.blog, best.overlappingTokens, best.matchScore)
  };
}

export function buildReadMoreSuggestion(blog: Pick<BlogRecommendation, "title" | "url">) {
  return `If you'd want to read more, I wrote a fuller piece on ${blog.title} here: ${blog.url}`;
}

async function fetchBlogFeedXml(feedUrl: string) {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": APP_NAME
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Blog feed request failed with ${response.status}.`);
  }

  return response.text();
}

export async function listBlogPostsForMatching(limit = BLOG_MATCH_LOOKBACK) {
  return prisma.blogPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: limit
  });
}

export async function getBlogKnowledgeSummary(): Promise<BlogKnowledgeSummary> {
  const [blogPostCount, lastSync] = await Promise.all([
    prisma.blogPost.count(),
    prisma.blogSyncRun.findFirst({
      orderBy: { createdAt: "desc" }
    })
  ]);

  return {
    feedUrl: RUNFITCOACH_BLOG_FEED_URL,
    blogPostCount,
    lastSyncAt: lastSync?.finishedAt ?? null,
    lastSyncStatus: lastSync?.status ?? null
  };
}

export async function syncRunFitCoachBlogPosts(options?: {
  force?: boolean;
  feedUrl?: string;
  triggeredBy?: string;
}): Promise<BlogSyncSummary> {
  const feedUrl = normalizeFeedUrl(options?.feedUrl || RUNFITCOACH_BLOG_FEED_URL);

  if (!options?.force) {
    const lastSuccessfulSync = await prisma.blogSyncRun.findFirst({
      where: { status: BlogSyncStatus.SUCCESS },
      orderBy: { finishedAt: "desc" }
    });

    if (
      lastSuccessfulSync?.finishedAt &&
      Date.now() - lastSuccessfulSync.finishedAt.getTime() < BLOG_SYNC_INTERVAL_DAYS * 86_400_000
    ) {
      return {
        skipped: true,
        feedUrl,
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        finishedAt: lastSuccessfulSync.finishedAt,
        message: "Blog sync is still fresh, so this scan reused the existing blog library."
      };
    }
  }

  const run = await prisma.blogSyncRun.create({
    data: {
      feedUrl,
      startedAt: new Date(),
      status: BlogSyncStatus.RUNNING
    }
  });

  try {
    const xml = await fetchBlogFeedXml(feedUrl);
    const items = parseBlogFeed(xml);

    if (!items.length) {
      throw new Error("The blog feed returned no blog items.");
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      const existing = await prisma.blogPost.findUnique({
        where: { url: item.url }
      });

      if (existing) {
        const shouldCountUpdate =
          existing.title !== item.title ||
          existing.summaryText !== item.summaryText ||
          existing.contentText !== item.contentText ||
          existing.author !== (item.author ?? null) ||
          existing.publishedAt.getTime() !== item.publishedAt.getTime() ||
          JSON.stringify(toKeywordArray(existing.matchKeywords)) !== JSON.stringify(item.matchKeywords) ||
          existing.sourceFeedUrl !== feedUrl ||
          existing.slug !== slugFromUrl(item.url);

        if (shouldCountUpdate) {
          await prisma.blogPost.update({
            where: { id: existing.id },
            data: {
              slug: slugFromUrl(item.url),
              title: item.title,
              author: item.author ?? null,
              publishedAt: item.publishedAt,
              summaryText: item.summaryText,
              contentText: item.contentText,
              matchKeywords: item.matchKeywords as Prisma.InputJsonValue,
              sourceFeedUrl: feedUrl
            }
          });
        }

        if (shouldCountUpdate) {
          updatedCount += 1;
        }

        continue;
      }

      await prisma.blogPost.create({
        data: {
          url: item.url,
          slug: slugFromUrl(item.url),
          title: item.title,
          author: item.author ?? null,
          publishedAt: item.publishedAt,
          summaryText: item.summaryText,
          contentText: item.contentText,
          matchKeywords: item.matchKeywords as Prisma.InputJsonValue,
          sourceFeedUrl: feedUrl
        }
      });

      createdCount += 1;
    }

    const finishedAt = new Date();
    await prisma.blogSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        status: BlogSyncStatus.SUCCESS,
        fetchedCount: items.length,
        createdCount,
        updatedCount
      }
    });

    return {
      skipped: false,
      feedUrl,
      fetchedCount: items.length,
      createdCount,
      updatedCount,
      finishedAt,
      message:
        createdCount || updatedCount
          ? `Blog sync finished. ${createdCount} new and ${updatedCount} updated posts are ready for drafting.`
          : "Blog sync finished. No new blog updates were found."
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Unknown blog sync error.";

    await prisma.blogSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        status: BlogSyncStatus.FAILED,
        errorMessage: message
      }
    });

    throw error;
  }
}
