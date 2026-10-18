/**
 * Claude (Anthropic API) adapter for grounded explanations.
 *
 * When ANTHROPIC_API_KEY is not set, every call returns a clear "not
 * configured" message instead of failing, so the dashboard keeps working
 * offline. No source code is sent anywhere unless a key is present and a user
 * explicitly asks a question.
 */
import { config } from "../config";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export interface ClaudeReply {
  text: string;
  model: string;
  configured: boolean;
}

/** Ask Claude a question with an optional system prompt. */
export async function askClaude(
  prompt: string,
  system?: string,
): Promise<ClaudeReply> {
  if (!config.anthropicApiKey) {
    return {
      text: "Claude is not configured. Set ANTHROPIC_API_KEY to enable AI explanations. (Brainstorm still records all evidence locally.)",
      model: "none",
      configured: false,
    };
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        text: `Claude API error (${res.status}): ${body.slice(0, 200)}`,
        model: "error",
        configured: true,
      };
    }

    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
      model?: string;
    };
    const text = (data.content ?? [])
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    return { text, model: data.model ?? MODEL, configured: true };
  } catch (err) {
    return {
      text: `Could not reach Claude: ${String(err).slice(0, 200)}`,
      model: "error",
      configured: true,
    };
  }
}
