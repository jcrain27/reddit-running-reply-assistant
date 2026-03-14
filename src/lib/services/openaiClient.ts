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

export async function createStructuredCompletion<T>({
  systemPrompt,
  userPrompt,
  temperature = 0.4
}: {
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
    model: env.OPENAI_MODEL,
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
