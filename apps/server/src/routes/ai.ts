import { type Express } from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { aiEnabled, nemotronEnabled } from "../config";
import { askClaude } from "../ai/claude";
import { summarizeFile } from "../ai/summarizer";
import { buildContextForQuestion } from "../ai/contextBuilder";
import {
  insertAiQuestion,
  insertAiAnswer,
  getFileSummaries,
} from "../database/repository";

/** Mount AI (Claude + Nemotron) routes. All degrade gracefully without keys. */
export function mountAiRoutes(app: Express): void {
  /** Whether AI features are available. */
  app.get("/api/ai/status", (_req, res) => {
    res.json({ claude: aiEnabled, nemotron: nemotronEnabled });
  });

  /**
   * "Why did you change this?" — builds a small grounded context (recorded
   * agent events on the file + its current contents) and asks Claude. No key =
   * returns a clear not-configured message; the recorded evidence is still sent
   * back to the UI so the developer sees what Brainstorm observed.
   */
  app.post("/api/ask", async (req, res) => {
    const filePath = String(req.body?.filePath ?? "").trim();
    const question = String(req.body?.question ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question required" });
      return;
    }

    const ctx = buildContextForQuestion(filePath, question);
    const questionId = `q_${randomUUID()}`;
    insertAiQuestion({
      id: questionId,
      filePath: filePath || undefined,
      question,
      context: ctx.prompt,
    });

    const reply = await askClaude(
      ctx.prompt,
      "You are Brainstorm, an assistant that explains why an AI coding agent made specific code changes. Answer concisely, ground your answer in the recorded evidence provided, and cite which events or file contents you used. If the recorded evidence does not support an answer, say so plainly rather than guessing.",
    );

    insertAiAnswer({
      id: `a_${randomUUID()}`,
      questionId,
      answer: reply.text,
      citations: JSON.stringify(ctx.citations),
      model: reply.model,
    });

    res.json({
      answer: reply.text,
      citations: ctx.citations,
      model: reply.model,
      configured: reply.configured,
      fileExists: ctx.fileExists,
    });
  });

  /** Summarize a single file (Claude by default, Nemotron if requested). */
  app.post("/api/summarize/file", async (req, res) => {
    const filePath = String(req.body?.filePath ?? "").trim();
    const useNemotron = Boolean(req.body?.nemotron);
    if (!filePath) {
      res.status(400).json({ error: "filePath required" });
      return;
    }
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      // file may not be on disk; summarize from path only
    }
    const result = await summarizeFile(filePath, content, useNemotron);
    res.json(result);
  });

  /** Bulk summarize many files (intended for Nemotron batch processing). */
  app.post("/api/summarize/bulk", async (req, res) => {
    const files: string[] = Array.isArray(req.body?.files) ? req.body.files : [];
    const results: Array<{
      filePath: string;
      summary: string;
      risk: string;
      model: string;
    }> = [];
    for (const f of files) {
      let content = "";
      try {
        content = readFileSync(f, "utf8");
      } catch {
        // skip unreadable
      }
      const r = await summarizeFile(f, content, true);
      results.push({
        filePath: f,
        summary: r.summary,
        risk: r.risk,
        model: r.model,
      });
    }
    res.json({ count: results.length, results });
  });

  /** All stored file summaries + risk flags. */
  app.get("/api/summaries", (_req, res) => {
    res.json(getFileSummaries());
  });
}
