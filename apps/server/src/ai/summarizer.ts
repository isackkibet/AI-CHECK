/**
 * Summarizer: turns raw evidence into short labels, file summaries, and risk
 * flags. Uses Claude when available; otherwise falls back to deterministic
 * heuristics so the dashboard is still useful offline.
 */
import { type BrainstormEvent } from "@brainstorm/shared";
import { askClaude } from "./claude";
import { summarizeWithNemotron } from "./nemotron";
import { upsertFileSummary } from "../database/repository";

/** Short label for an event (used in the timeline). Offline = heuristic. */
export function labelEvent(evt: BrainstormEvent): string {
  // Heuristic label is just the summary we already computed during parsing;
  // when Claude is configured we could enrich it, but the parser's summary is
  // already concise. Kept as a seam for future AI labelling.
  return evt.summary;
}

/** Classify a file's risk from its path/content heuristically. */
function heuristicRisk(filePath: string, content: string): { risk: string; reason: string } {
  const lc = content.toLowerCase();
  const reasons: string[] = [];
  if (/password|secret|api[_-]?key|token|private[_-]?key|credentials/i.test(content)) {
    reasons.push("handles secrets/credentials");
  }
  if (/eval\(|child_process|exec\(|execsync/i.test(content)) {
    reasons.push("executes dynamic code or commands");
  }
  if (/auth|login|session|jwt/i.test(filePath.toLowerCase()) || /bcrypt|hash/i.test(lc)) {
    reasons.push("involved in authentication");
  }
  if (/\.env|process\.env/i.test(content) && /password|secret|key/i.test(content)) {
    reasons.push("reads sensitive env values");
  }
  if (reasons.length === 0) return { risk: "low", reason: "" };
  return { risk: reasons.length >= 2 ? "high" : "medium", reason: reasons.join("; ") };
}

/** Summarize a single file. With Claude: grounded; otherwise heuristic. */
export async function summarizeFile(
  filePath: string,
  content: string,
  useNemotron = false,
): Promise<{ summary: string; risk: string; riskReason: string; model: string }> {
  const heuristic = heuristicRisk(filePath, content);

  if (useNemotron) {
    const reply = await summarizeWithNemotron(
      `File: ${filePath}\n\n${content.slice(0, 6000)}`,
      "Summarize what this source file does in one or two sentences for a developer, and note any risk.",
    );
    const summary = reply.configured ? reply.text : `(${heuristic.reason || "no summary yet"})`;
    upsertFileSummary({
      filePath,
      summary,
      risk: heuristic.risk,
      riskReason: heuristic.risk,
    });
    return {
      summary,
      risk: heuristic.risk,
      riskReason: heuristic.reason,
      model: reply.configured ? "nemotron" : "heuristic",
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const reply = await askClaude(
      `File: ${filePath}\n\n${content.slice(0, 6000)}\n\nIn 1-2 sentences, summarize what this file does. Then on a new line write RISK: low|medium|high and a short reason.`,
    );
    const lines = reply.text.split("\n");
    const riskLine = lines.find((l) => /risk/i.test(l)) ?? "";
    const riskMatch = riskLine.match(/(low|medium|high)/i);
    const risk = riskMatch ? riskMatch[1].toLowerCase() : heuristic.risk;
    const summary = lines.filter((l) => !/risk:/i.test(l)).join(" ").trim() || reply.text;
    upsertFileSummary({ filePath, summary, risk, riskReason: riskLine });
    return { summary, risk, riskReason: riskLine, model: reply.model };
  }

  // Offline heuristic.
  const summary = `${filePath.split("/").pop()}: ${heuristic.reason || "no obvious concerns"}.`;
  upsertFileSummary({
    filePath,
    summary,
    risk: heuristic.risk,
    riskReason: heuristic.reason,
  });
  return { summary, risk: heuristic.risk, riskReason: heuristic.reason, model: "heuristic" };
}
