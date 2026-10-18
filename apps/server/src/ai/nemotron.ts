/**
 * NVIDIA Nemotron adapter for bulk analysis (file summaries, step labels).
 *
 * Uses NVIDIA's OpenAI-compatible inference endpoint. When NVIDIA_API_KEY is
 * not set, calls return a "not configured" placeholder so the rest of the
 * pipeline (and the dashboard) keeps working. The intent is that bulk jobs run
 * on a Brev-hosted GPU later; locally we either call NVIDIA's hosted endpoint
 * or skip cleanly.
 */
import { config } from "../config";

const NEMOTRON_URL =
  process.env.NEMOTRON_URL ?? "https://integrate.api.nvidia.com/v1";
const NEMOTRON_MODEL =
  process.env.NEMOTRON_MODEL ?? "nvidia/llama-3.1-nemotron-nano-8b-v1";

export interface NemotronReply {
  text: string;
  configured: boolean;
}

/** Ask Nemotron for a short summary of arbitrary content. */
export async function summarizeWithNemotron(
  content: string,
  instruction = "Summarize this file in one or two sentences for a developer.",
): Promise<NemotronReply> {
  if (!config.nvidiaApiKey) {
    return { text: "(Nemotron not configured — set NVIDIA_API_KEY)", configured: false };
  }
  try {
    const res = await fetch(`${NEMOTRON_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: NEMOTRON_MODEL,
        max_tokens: 256,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: content.slice(0, 8000) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { text: `Nemotron API error (${res.status}): ${body.slice(0, 160)}`, configured: true };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { text, configured: true };
  } catch (err) {
    return { text: `Could not reach Nemotron: ${String(err).slice(0, 160)}`, configured: true };
  }
}
