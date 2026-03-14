import { formatDistanceToNowStrict } from "date-fns";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatAge(date: Date): string {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function safeParseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseMultilineList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeMultilineList(values: string[]): string {
  return values.join("\n");
}

export function tokenize(value: string): string[] {
  return normalizeWhitespace(value.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function calculateTextSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (!tokensA.size || !tokensB.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }

  return overlap / new Set([...tokensA, ...tokensB]).size;
}

export function extractFirstLine(value: string): string {
  return normalizeWhitespace(value.split(/\r?\n/)[0] ?? "");
}

export function extractFirstSentence(value: string): string {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return normalizeWhitespace(match?.[1] ?? normalized);
}

export function computeEditDistance(a: string, b: string): number {
  const left = a ?? "";
  const right = b ?? "";
  const dp = Array.from({ length: left.length + 1 }, () =>
    Array.from<number>({ length: right.length + 1 }).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

export function inferToneSoftened(original: string, edited: string): boolean {
  const originalText = original.toLowerCase();
  const editedText = edited.toLowerCase();

  const directMarkers = ["definitely", "absolutely", "must", "always", "never"];
  const cautiousMarkers = ["might", "may", "could", "consider", "probably"];

  const originalDirect = directMarkers.filter((token) => originalText.includes(token)).length;
  const editedDirect = directMarkers.filter((token) => editedText.includes(token)).length;
  const originalCautious = cautiousMarkers.filter((token) => originalText.includes(token)).length;
  const editedCautious = cautiousMarkers.filter((token) => editedText.includes(token)).length;

  return editedDirect < originalDirect || editedCautious > originalCautious;
}

export function inferReplyShortened(original: string, edited: string): boolean {
  return edited.trim().length < original.trim().length;
}

export function toTitleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
