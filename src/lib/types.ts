export interface RedditPost {
  id: string;
  name: string;
  subreddit: string;
  title: string;
  author: string;
  selftext: string;
  permalink: string;
  url: string;
  createdUtc: number;
  score: number;
  numComments: number;
  isSelf: boolean;
  removedByCategory: string | null;
  over18: boolean;
  linkFlairText?: string | null;
}

export interface RedditComment {
  id: string;
  name: string;
  author: string;
  body: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  parentId?: string | null;
  replies?: RedditComment[];
}

export interface ScoreBreakdown {
  adviceScore: number;
  relevanceScore: number;
  engagementScore: number;
  priorityScore: number;
  promoRiskScore: number;
  medicalRiskScore: number;
  selectedReason: string;
  shouldDraft: boolean;
  priority: "LOW" | "NORMAL" | "HIGH";
}

export interface DraftGenerationResult {
  coreReply: string;
  alternateReply: string;
  optionalCTA: string;
  confidence: number;
  reasoning: string;
  modelName: string;
  recommendedBlog?: BlogRecommendation;
}

export interface BlogRecommendation {
  id: string;
  title: string;
  url: string;
  summaryText: string;
  matchScore: number;
  reason: string;
}

export interface CommentReplyDraftGenerationResult {
  coreReply: string;
  alternateReply: string;
  confidence: number;
  reasoning: string;
  modelName: string;
}

export interface SafetyValidationResult {
  approved: boolean;
  warnings: string[];
  duplicateRiskScore: number;
  promotionalRiskScore: number;
  medicalCertaintyRiskScore: number;
  openingLine: string;
}

export interface NotificationDispatchResult {
  channel: "EMAIL" | "SLACK";
  success: boolean;
  errorMessage?: string;
}

export interface ScanJobResult {
  scannedCount: number;
  candidateCount: number;
  draftedCount: number;
  skippedCount: number;
  errorCount: number;
  notes: string[];
}
