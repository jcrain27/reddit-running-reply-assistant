import OpenAI from "openai";

import { getEnv } from "@/lib/env";

let cachedClient: OpenAI | null | undefined;

function getClient(): OpenAI | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL
  });

  return cachedClient;
}

function extractJson(content: string): string {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return content.slice(firstBrace, lastBrace + 1);
}

export function getDraftModel() {
  const env = getEnv();
  return env.OPENAI_DRAFT_MODEL || (env.OPENAI_MODEL === "gpt-4.1-mini" ? "gpt-5.4" : env.OPENAI_MODEL);
}

export function getScoringModel() {
  const env = getEnv();
  if (env.OPENAI_SCORING_MODEL) {
    return env.OPENAI_SCORING_MODEL;
  }

  if (env.OPENAI_MODEL === "gpt-4.1-mini") {
    return "gpt-5.4-mini";
  }

  return env.OPENAI_MODEL;
}

export function getEmbeddingModel() {
  const env = getEnv();
  return env.OPENAI_EMBEDDING_MODEL;
}

export async function createStructuredCompletion<T>({
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.4
}: {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<T | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  const env = getEnv();
  const completion = await client.chat.completions.create({
    model: model || env.OPENAI_MODEL,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ]
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(extractJson(content)) as T;
}

export async function createEmbedding(input: string, model?: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  const env = getEnv();
  const response = await client.embeddings.create({
    model: model || env.OPENAI_EMBEDDING_MODEL,
    input
  });

  return response.data[0]?.embedding ?? null;
}
