import { getEnv } from "@/lib/env";
import type { RedditComment, RedditPost } from "@/lib/types";

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        id: string;
        name: string;
        subreddit: string;
        title: string;
        author: string;
        selftext: string;
        permalink: string;
        url: string;
        created_utc: number;
        score: number;
        num_comments: number;
        is_self: boolean;
        removed_by_category: string | null;
        over_18: boolean;
        link_flair_text?: string | null;
      };
    }>;
  };
}

interface RedditCommentThreadResponseItem {
  kind?: string;
  data?: {
    children?: Array<{
      kind?: string;
      data?: {
        id: string;
        name: string;
        author: string;
        body: string;
        subreddit: string;
        permalink: string;
        created_utc: number;
        score: number;
        parent_id?: string | null;
        replies?:
          | ""
          | {
              data?: {
                children?: Array<{
                  kind?: string;
                  data?: any;
                }>;
              };
            };
      };
    }>;
  };
}

interface RedditTokenResponse {
  access_token: string;
  expires_in: number;
}

let tokenCache:
  | {
      value: string;
      expiresAt: number;
    }
  | undefined;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) {
        return response;
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
      await sleep(retryAfter || 750 * (attempt + 1));
      attempt += 1;
    } catch (error) {
      lastError = error;
      await sleep(750 * (attempt + 1));
      attempt += 1;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Failed request to ${url}`);
}

async function getAccessToken(): Promise<string | null> {
  const env = getEnv();

  if (
    tokenCache &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.value;
  }

  if (
    !env.REDDIT_CLIENT_ID ||
    !env.REDDIT_CLIENT_SECRET ||
    !env.REDDIT_USERNAME ||
    !env.REDDIT_PASSWORD
  ) {
    return null;
  }

  const auth = Buffer.from(
    `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`,
    "utf8"
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "password",
    username: env.REDDIT_USERNAME,
    password: env.REDDIT_PASSWORD
  });

  const response = await fetchWithRetry("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": env.REDDIT_USER_AGENT
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve Reddit access token (${response.status}).`);
  }

  const json = (await response.json()) as RedditTokenResponse;
  tokenCache = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000
  };

  return tokenCache.value;
}

async function redditFetch(path: string, init: RequestInit, allowPublic = false) {
  const env = getEnv();
  const token = await getAccessToken();

  if (!token && allowPublic) {
    return fetchWithRetry(`https://www.reddit.com${path}`, {
      ...init,
      headers: {
        "User-Agent": env.REDDIT_USER_AGENT,
        ...(init.headers ?? {})
      }
    });
  }

  if (!token) {
    throw new Error("Reddit OAuth credentials are required for this action.");
  }

  return fetchWithRetry(`https://oauth.reddit.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": env.REDDIT_USER_AGENT,
      ...(init.headers ?? {})
    }
  });
}

export async function fetchLatestPosts(subreddit: string, limit = 20): Promise<RedditPost[]> {
  const response = await redditFetch(`/r/${subreddit}/new.json?limit=${limit}`, {}, true);

  if (!response.ok) {
    throw new Error(`Failed to fetch posts for r/${subreddit} (${response.status}).`);
  }

  const json = (await response.json()) as RedditListingResponse;
  const children = json.data?.children ?? [];

  return children
    .map((child) => child.data)
    .filter(Boolean)
    .map((post) => ({
      id: post!.id,
      name: post!.name,
      subreddit: post!.subreddit,
      title: post!.title,
      author: post!.author,
      selftext: post!.selftext ?? "",
      permalink: `https://www.reddit.com${post!.permalink}`,
      url: post!.url,
      createdUtc: post!.created_utc,
      score: post!.score ?? 0,
      numComments: post!.num_comments ?? 0,
      isSelf: post!.is_self ?? false,
      removedByCategory: post!.removed_by_category ?? null,
      over18: post!.over_18 ?? false,
      linkFlairText: post!.link_flair_text ?? null
    }));
}

function parseCommentNode(node: {
  kind?: string;
  data?: {
    id: string;
    name: string;
    author: string;
    body: string;
    subreddit: string;
    permalink: string;
    created_utc: number;
    score: number;
    parent_id?: string | null;
    replies?:
      | ""
      | {
          data?: {
            children?: Array<{
              kind?: string;
              data?: any;
            }>;
          };
        };
  };
}): RedditComment | null {
  if (node.kind !== "t1" || !node.data?.id) {
    return null;
  }

  const replyContainer =
    typeof node.data.replies === "object" && node.data.replies !== null
      ? node.data.replies
      : null;
  const replyChildren = replyContainer?.data?.children ?? [];

  const replies = replyChildren
    .map((child) => parseCommentNode(child as any))
    .filter((comment): comment is RedditComment => Boolean(comment));

  return {
    id: node.data.id,
    name: node.data.name,
    author: node.data.author,
    body: node.data.body ?? "",
    subreddit: node.data.subreddit,
    permalink: `https://www.reddit.com${node.data.permalink}`,
    createdUtc: node.data.created_utc,
    score: node.data.score ?? 0,
    parentId: node.data.parent_id ?? null,
    replies
  };
}

function normalizeCommentPermalink(permalink: string) {
  const withoutDomain = permalink
    .replace(/^https?:\/\/(www\.)?reddit\.com/i, "")
    .replace(/\/$/, "");
  return `${withoutDomain}.json?context=0&depth=8&sort=new`;
}

export async function fetchRepliesForComment(commentPermalink: string): Promise<RedditComment[]> {
  const response = await redditFetch(normalizeCommentPermalink(commentPermalink), {}, true);

  if (!response.ok) {
    throw new Error(`Failed to fetch replies for comment (${response.status}).`);
  }

  const json = (await response.json()) as RedditCommentThreadResponseItem[];
  const commentListing = json[1];
  const rootCommentNode = commentListing?.data?.children?.find((child) => child.kind === "t1");
  const rootComment = rootCommentNode ? parseCommentNode(rootCommentNode as any) : null;

  return rootComment?.replies ?? [];
}

export async function submitComment(parentThingId: string, text: string) {
  const response = await redditFetch("/api/comment", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      api_type: "json",
      return_rtjson: "false",
      text,
      thing_id: parentThingId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to submit Reddit comment (${response.status}).`);
  }

  const json = (await response.json()) as {
    json?: {
      errors?: string[][];
      data?: {
        things?: Array<{
          data?: {
            id?: string;
          };
        }>;
      };
    };
  };

  const apiErrors = json.json?.errors ?? [];
  if (apiErrors.length > 0) {
    throw new Error(apiErrors.map((entry) => entry.join(": ")).join("; "));
  }

  const redditCommentId = json.json?.data?.things?.[0]?.data?.id;
  if (!redditCommentId) {
    throw new Error("Reddit did not return a comment id.");
  }

  return redditCommentId;
}

export async function canDirectSubmit(): Promise<boolean> {
  const env = getEnv();
  return Boolean(
    env.REDDIT_CLIENT_ID &&
      env.REDDIT_CLIENT_SECRET &&
      env.REDDIT_USERNAME &&
      env.REDDIT_PASSWORD
  );
}

export function redditThingIdFromCommentId(commentId: string) {
  return commentId.startsWith("t1_") ? commentId : `t1_${commentId}`;
}

export function extractCommentIdFromPermalink(permalink: string) {
  const normalized = permalink.trim().replace(/\/+$/, "");
  const match = normalized.match(/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)(?:\/([a-z0-9]+))?$/i);
  return match?.[2] || match?.[1] || null;
}
