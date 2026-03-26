import { BlogSyncStatus, Prisma, type BlogPost } from "@prisma/client";

import { APP_NAME } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { createEmbedding, getEmbeddingModel } from "@/lib/services/openaiClient";
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
const MAX_EMBEDDING_INPUT_LENGTH = 4_500;

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

function toEmbeddingArray(value: Prisma.JsonValue | null | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is number => typeof entry === "number");
}

function buildBlogEmbeddingInput(input: {
  title: string;
  summaryText: string;
  contentText: string;
  matchKeywords: string[];
}) {
  return truncate(
    normalizeWhitespace(
      `${input.title}\n\n${input.summaryText}\n\n${input.contentText}\n\n${input.matchKeywords.join(" ")}`
    ),
    MAX_EMBEDDING_INPUT_LENGTH
  );
}

function buildQueryEmbeddingInput(input: { postTitle: string; postBodyText?: string }) {
  return truncate(normalizeWhitespace(`${input.postTitle}\n\n${input.postBodyText || ""}`), 2_800);
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || !right.length || left.length !== right.length) {
    return null;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }

  if (!leftNorm || !rightNorm) {
    return null;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
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
  matchScore: number,
  semanticScore: number | null
) {
  if (semanticScore !== null && semanticScore >= 0.55) {
    return "Semantic match is strong, so this article should deepen the same underlying topic naturally.";
  }

  if (overlappingTokens.length) {
    return `Strong topic overlap on ${overlappingTokens.slice(0, 3).join(", ")}.`;
  }

  if (matchScore >= 0.3) {
    return `This article is a strong fit for the thread's main training question.`;
  }

  return `This article gives Johnny a fuller read-more resource if the reply needs it.`;
}

async function createQueryEmbedding(input: { postTitle: string; postBodyText?: string }) {
  if (process.env.NODE_ENV === "test" || !process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    return await createEmbedding(buildQueryEmbeddingInput(input), getEmbeddingModel());
  } catch (error) {
    console.error(
      "Blog recommendation embedding lookup fell back to lexical matching:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function calculateLexicalMatch(
  combinedText: string,
  inputTokens: Set<string>,
  blog: Pick<BlogPost, "title" | "summaryText" | "contentText" | "publishedAt" | "matchKeywords">
) {
  const titleTokens = new Set(meaningfulTokens(blog.title));
  const summaryTokens = new Set(
    meaningfulTokens(
      `${blog.summaryText} ${blog.contentText.slice(0, 1200)} ${toKeywordArray(blog.matchKeywords).join(" ")}`
    )
  );
  const overlappingTokens = [...inputTokens].filter(
    (token) => titleTokens.has(token) || summaryTokens.has(token)
  );
  const titleOverlap =
    overlappingTokens.filter((token) => titleTokens.has(token)).length / Math.max(titleTokens.size, 1);
  const summaryOverlap =
    overlappingTokens.filter((token) => summaryTokens.has(token)).length / Math.max(summaryTokens.size, 1);
  const similarity = calculateTextSimilarity(
    combinedText,
    `${blog.title} ${blog.summaryText} ${toKeywordArray(blog.matchKeywords).join(" ")}`
  );
  const recencyDays = (Date.now() - blog.publishedAt.getTime()) / 86_400_000;
  const recencyBoost = recencyDays <= 45 ? 0.05 : recencyDays <= 120 ? 0.02 : 0;
  const titlePhraseBonus = combinedText.toLowerCase().includes(blog.title.toLowerCase()) ? 0.2 : 0;
  const lexicalScore = clamp(
    similarity * 0.35 + titleOverlap * 0.32 + summaryOverlap * 0.23 + recencyBoost + titlePhraseBonus,
    0,
    1
  );

  return {
    lexicalScore,
    overlappingTokens
  };
}

export async function recommendBlogPost(input: {
  postTitle: string;
  postBodyText?: string;
  blogPosts: Array<
    Pick<
      BlogPost,
      | "id"
      | "title"
      | "url"
      | "summaryText"
      | "contentText"
      | "publishedAt"
      | "matchKeywords"
      | "semanticEmbedding"
      | "semanticEmbeddingModel"
    >
  >;
}): Promise<BlogRecommendation | null> {
  const combinedText = normalizeWhitespace(`${input.postTitle} ${input.postBodyText || ""}`);
  const inputTokens = new Set(meaningfulTokens(combinedText));

  if (!combinedText || !input.blogPosts.length || !inputTokens.size) {
    return null;
  }

  const embeddingModel = getEmbeddingModel();
  const queryEmbedding = await createQueryEmbedding(input);
  const ranked = input.blogPosts
    .map((blog) => {
      const { lexicalScore, overlappingTokens } = calculateLexicalMatch(combinedText, inputTokens, blog);
      const blogEmbedding =
        blog.semanticEmbeddingModel === embeddingModel ? toEmbeddingArray(blog.semanticEmbedding) : [];
      const rawSemanticScore =
        queryEmbedding && blogEmbedding.length
          ? cosineSimilarity(queryEmbedding, blogEmbedding)
          : null;
      const semanticScore = rawSemanticScore === null ? null : clamp(rawSemanticScore, 0, 1);
      const matchScore =
        semanticScore === null
          ? lexicalScore
          : clamp(semanticScore * 0.72 + lexicalScore * 0.28, 0, 1);

      return {
        blog,
        matchScore,
        overlappingTokens,
        semanticScore
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
    reason: buildBlogReason(best.blog, best.overlappingTokens, best.matchScore, best.semanticScore)
  };
}

export function buildReadMoreSuggestion(blog: Pick<BlogRecommendation, "title" | "url">) {
  return `If you'd want to read more, I wrote a fuller piece on ${blog.title} here: ${blog.url}`;
}

async function createBlogEmbedding(item: ParsedBlogFeedItem) {
  if (process.env.NODE_ENV === "test" || !process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const embedding = await createEmbedding(
      buildBlogEmbeddingInput({
        title: item.title,
        summaryText: item.summaryText,
        contentText: item.contentText,
        matchKeywords: item.matchKeywords
      }),
      getEmbeddingModel()
    );

    return embedding;
  } catch (error) {
    console.error(
      "Blog embedding generation failed; semantic matching will fall back for this article:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
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
      const slug = slugFromUrl(item.url);
      const embeddingModel = getEmbeddingModel();

      if (existing) {
        const shouldCountUpdate =
          existing.title !== item.title ||
          existing.summaryText !== item.summaryText ||
          existing.contentText !== item.contentText ||
          existing.author !== (item.author ?? null) ||
          existing.publishedAt.getTime() !== item.publishedAt.getTime() ||
          JSON.stringify(toKeywordArray(existing.matchKeywords)) !== JSON.stringify(item.matchKeywords) ||
          existing.sourceFeedUrl !== feedUrl ||
          existing.slug !== slug;
        const shouldRefreshEmbedding =
          shouldCountUpdate ||
          !toEmbeddingArray(existing.semanticEmbedding).length ||
          existing.semanticEmbeddingModel !== embeddingModel;

        if (shouldCountUpdate) {
          const embedding = shouldRefreshEmbedding ? await createBlogEmbedding(item) : null;
          await prisma.blogPost.update({
            where: { id: existing.id },
            data: {
              slug,
              title: item.title,
              author: item.author ?? null,
              publishedAt: item.publishedAt,
              summaryText: item.summaryText,
              contentText: item.contentText,
              matchKeywords: item.matchKeywords as Prisma.InputJsonValue,
              semanticEmbedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.JsonNull,
              semanticEmbeddingModel: embedding ? embeddingModel : null,
              semanticEmbeddingUpdatedAt: embedding ? new Date() : null,
              sourceFeedUrl: feedUrl
            }
          });
        } else if (shouldRefreshEmbedding) {
          const embedding = await createBlogEmbedding(item);
          await prisma.blogPost.update({
            where: { id: existing.id },
            data: {
              semanticEmbedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.JsonNull,
              semanticEmbeddingModel: embedding ? embeddingModel : null,
              semanticEmbeddingUpdatedAt: embedding ? new Date() : null
            }
          });
        }

        if (shouldCountUpdate) {
          updatedCount += 1;
        }

        continue;
      }

      const embedding = await createBlogEmbedding(item);
      await prisma.blogPost.create({
        data: {
          url: item.url,
          slug,
          title: item.title,
          author: item.author ?? null,
          publishedAt: item.publishedAt,
          summaryText: item.summaryText,
          contentText: item.contentText,
          matchKeywords: item.matchKeywords as Prisma.InputJsonValue,
          semanticEmbedding: embedding ? (embedding as Prisma.InputJsonValue) : Prisma.JsonNull,
          semanticEmbeddingModel: embedding ? embeddingModel : null,
          semanticEmbeddingUpdatedAt: embedding ? new Date() : null,
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
