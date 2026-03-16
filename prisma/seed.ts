import { Prisma } from "@prisma/client";

import { hashPassword } from "../src/lib/auth";
import {
  CANDIDATE_STATUSES,
  DEFAULT_BANNED_PHRASES,
  DEFAULT_MEDICAL_RISK_KEYWORDS,
  DEFAULT_SUBREDDITS
} from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { getEnv } from "../src/lib/env";

function voiceExampleId(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

async function main() {
  const env = getEnv();

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the initial user.");
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL.toLowerCase() },
    update: { passwordHash },
    create: {
      email: env.ADMIN_EMAIL.toLowerCase(),
      passwordHash
    }
  });

  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: {},
    create: {
      id: "app",
      medicalRiskKeywords: DEFAULT_MEDICAL_RISK_KEYWORDS as Prisma.InputJsonValue,
      bannedPhrases: DEFAULT_BANNED_PHRASES as Prisma.InputJsonValue,
      candidateStatuses: CANDIDATE_STATUSES as unknown as Prisma.InputJsonValue
    }
  });

  for (const subreddit of DEFAULT_SUBREDDITS) {
    await prisma.subredditConfig.upsert({
      where: { name: subreddit },
      update: {},
      create: {
        name: subreddit,
        allowCTA: subreddit !== "advancedrunning",
        strictNoPromo: subreddit === "advancedrunning",
        advancedTone: subreddit === "advancedrunning"
      }
    });
  }

  const seededRules: Array<{
    subreddit: string;
    ruleType: string;
    ruleValue: string;
  }> = [
    {
      subreddit: "advancedrunning",
      ruleType: "style_hint",
      ruleValue: "Assume the reader understands basic training concepts and keep the answer concise."
    },
    {
      subreddit: "advancedrunning",
      ruleType: "default_reply_style",
      ruleValue: "training-literate, direct, concise"
    },
    {
      subreddit: "advancedrunning",
      ruleType: "banned_phrase",
      ruleValue: "coach here"
    },
    {
      subreddit: "firstmarathon",
      ruleType: "style_hint",
      ruleValue: "Simplify jargon and keep the advice reassuring but practical."
    },
    {
      subreddit: "marathon_training",
      ruleType: "advice_boost_keyword",
      ruleValue: "race strategy"
    },
    {
      subreddit: "trailrunning",
      ruleType: "style_hint",
      ruleValue: "Acknowledge terrain, elevation, and pacing variability on trails."
    }
  ];

  for (const entry of seededRules) {
    const config = await prisma.subredditConfig.findUnique({
      where: { name: entry.subreddit },
      select: { id: true }
    });

    if (!config) {
      continue;
    }

    await prisma.subredditRule.upsert({
      where: {
        subredditConfigId_ruleType_ruleValue: {
          subredditConfigId: config.id,
          ruleType: entry.ruleType,
          ruleValue: entry.ruleValue
        }
      },
      update: {},
      create: {
        subredditConfigId: config.id,
        ruleType: entry.ruleType,
        ruleValue: entry.ruleValue
      }
    });
  }

  const voiceExamples = [
    {
      label: "Concise coaching voice",
      sourceType: "seed",
      content:
        "Keep replies practical, grounded, and training-literate. Start with the main point, give one or two reasons, and suggest the next step without sounding salesy."
    },
    {
      label: "Signal over hype",
      sourceType: "seed",
      content:
        "Prefer clear, evidence-aware teaching over hacks, bravado, or hot takes. Reduce drama, avoid overclaiming, and help the runner see the situation more clearly."
    },
    {
      label: "Consistency over hero days",
      sourceType: "seed",
      content:
        "Bias advice toward repeatable weeks, durable progress, and sustainable training instead of proving fitness in a single workout or making reactive changes after one bad day."
    },
    {
      label: "Adaptability and response",
      sourceType: "seed",
      content:
        "Treat routines as helpful but not destiny. When conditions feel off, stay calm, avoid catastrophizing, and focus on the next workable adjustment instead of the perfect plan."
    },
    {
      label: "Real coaching story fragment template",
      sourceType: "story",
      content:
        "Example format: I see this a lot with runners who turn every easy day into a medium day. Once they truly back off for 10 to 14 days, workouts usually start clicking again. Only use real patterns Johnny can honestly stand behind.",
      enabled: false
    },
    {
      label: "Real runner perspective template",
      sourceType: "experience",
      content:
        "Example format: When I have rushed a build, the biggest mistake was trying to prove fitness too early. Keep this limited to things Johnny has actually experienced or genuinely observed.",
      enabled: false
    },
    {
      label: "Principle then next step",
      sourceType: "seed",
      content:
        "When possible, structure the reply in three moves: identify the real issue, explain the principle underneath it, and give one practical next step the runner can use immediately."
    },
    {
      label: "Johnny story - bad race to commitment",
      sourceType: "story",
      content:
        "A bad race can either rattle you or sharpen you. Some of the best progress comes after being honest about what fell short and then getting more consistent about fixing it."
    },
    {
      label: "Johnny story - healthy boring weeks matter",
      sourceType: "experience",
      content:
        "Injury changes how you value training. Sometimes the real win is not one huge workout, it is stacking several healthy, boring weeks in a row."
    },
    {
      label: "Johnny story - discipline over motivation",
      sourceType: "experience",
      content:
        "I trust discipline more than motivation. Motivation comes and goes, but progress usually comes from showing up when the work feels ordinary."
    },
    {
      label: "Johnny story - team culture matters",
      sourceType: "story",
      content:
        "A lot of growth happens in environments where consistency feels normal. Even in an individual sport, the people around you can raise the standard for how steady your work becomes."
    },
    {
      label: "Johnny story - simple coaching works",
      sourceType: "experience",
      content:
        "Most runners do not need a fancier plan. They need a plan that fits real life, gets adjusted when life changes, and helps them string together solid weeks."
    },
    {
      label: "Johnny story - comeback runners",
      sourceType: "story",
      content:
        "Some of the best progress I have seen comes after layoffs, kids, or messy training seasons. The breakthrough is usually not doing everything, it is doing the right things repeatably."
    },
    {
      label: "Johnny story - recovery tools are tools",
      sourceType: "experience",
      content:
        "Recovery tools can help, but they are still tools. If something simple helps you absorb training and feel better for the next good session, it can be useful without pretending it replaces the actual work."
    },
    {
      label: "Johnny story - run is part of life",
      sourceType: "experience",
      content:
        "Running works best when it fits the rest of your life instead of fighting it all the time. A good plan should support the whole week, not just the perfect day."
    },
    {
      label: "Beginner-friendly voice",
      sourceType: "seed",
      content:
        "For beginner threads, simplify jargon, reassure without sugarcoating, and keep the advice focused on consistency, recovery, and pacing basics."
    },
    {
      label: "Medical caution",
      sourceType: "seed",
      content:
        "When a post sounds injury-related, stay cautious. Avoid diagnosis, encourage professional care for red flags, and focus on conservative next steps."
    }
  ];

  for (const example of voiceExamples) {
    const id = voiceExampleId(example.label);
    await prisma.voiceExample.upsert({
      where: { id },
      update: {
        label: example.label,
        sourceType: example.sourceType,
        content: example.content,
        enabled: example.enabled ?? true
      },
      create: {
        id,
        label: example.label,
        sourceType: example.sourceType,
        content: example.content,
        enabled: example.enabled ?? true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
