export const DEFAULT_SUBREDDITS = [
  "running",
  "advancedrunning",
  "marathon_training",
  "trailrunning",
  "firstmarathon"
] as const;

export const CANDIDATE_STATUSES = [
  "new",
  "drafted",
  "reviewed",
  "approved",
  "submitted",
  "skipped",
  "archived",
  "failed"
] as const;

export const DEFAULT_BANNED_PHRASES = [
  "DM me for coaching",
  "check out my business",
  "buy my training plan",
  "visit my website",
  "limited spots available"
];

export const DEFAULT_MEDICAL_RISK_KEYWORDS = [
  "chest pain",
  "fainting",
  "severe swelling",
  "fracture",
  "stress fracture",
  "can't bear weight",
  "can’t bear weight",
  "eating disorder",
  "red-s",
  "suicidal",
  "medication"
];

export const ADVICE_INTENT_PHRASES = [
  "should i",
  "how do i",
  "what should i do",
  "training for",
  "pace",
  "easy run",
  "long run",
  "marathon",
  "half marathon",
  "5k",
  "10k",
  "injury",
  "sore",
  "recovery",
  "cadence",
  "threshold",
  "vo2",
  "tempo",
  "mileage",
  "plan",
  "coach"
];

export const EXPERTISE_KEYWORDS = [
  "training",
  "pace",
  "pacing",
  "marathon",
  "half marathon",
  "5k",
  "10k",
  "mileage",
  "easy run",
  "long run",
  "recovery",
  "cadence",
  "threshold",
  "tempo",
  "vo2",
  "base building",
  "workout",
  "race strategy",
  "strength",
  "trail"
];

export const PROMO_RISK_PHRASES = [
  "coach",
  "coaching",
  "plan",
  "program",
  "business",
  "website",
  "instagram",
  "youtube",
  "dm me"
];

export const MEDICAL_CERTAINTY_PHRASES = [
  "you definitely have",
  "this is clearly",
  "it is a stress fracture",
  "you need medication",
  "i diagnose",
  "you should take this medication"
];

export const DEFAULT_PROMPT_VERSIONS = {
  system: "2026-03-13.1",
  user: "2026-03-13.1"
} as const;

export const MAX_RECENT_DRAFTS_FOR_SIMILARITY = 50;

export const APP_NAME = "Reddit Running Reply Assistant";
