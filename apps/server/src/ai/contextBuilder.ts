import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { getDb } from "../database/db";

export interface BuiltContext {
  prompt: string;
  citations: string[];
  fileExists: boolean;
  sessionProjectPath: string | null;
}

interface EventRow {
  id: string;
  session_id: string;
  type: string;
  timestamp: string;
  summary: string;
  file_path: string | null;
}

/**
 * Assemble a small, grounded context for a "why did you change this?" question:
 * the recorded agent events that touched the file, plus its current contents.
 * Only this selected evidence is sent to the model — never the whole repo.
 */
export function buildContextForQuestion(
  filePath: string,
  question: string,
): BuiltContext {
  const db = getDb();

  // Events that touched this file (match exact or suffix, since paths may be
  // stored relative to different session cwds).
  const events = db
    .prepare(
      `SELECT * FROM events
       WHERE file_path = ? OR file_path LIKE ?
       ORDER BY timestamp DESC LIMIT 20`,
    )
    .all(filePath, `%/${filePath}`) as EventRow[];

  // Resolve the project root from the most recent touching event's session.
  let sessionProjectPath: string | null = null;
  if (events.length > 0) {
    const session = db
      .prepare("SELECT project_path AS p FROM sessions WHERE id = ?")
      .get(events[0].session_id) as { p: string | null } | undefined;
    sessionProjectPath = session?.p ?? null;
  }

  // Try to read the file's current contents (absolute resolution).
  let content = "";
  let fileExists = false;
  const absolute = sessionProjectPath
    ? resolvePath(sessionProjectPath, filePath)
    : filePath;
  try {
    content = readFileSync(absolute, "utf8").slice(0, 4000);
    fileExists = true;
  } catch {
    try {
      content = readFileSync(filePath, "utf8").slice(0, 4000);
      fileExists = true;
    } catch {
      fileExists = false;
    }
  }

  const citations: string[] = [];
  if (events.length) {
    citations.push(`${events.length} recorded agent event(s) touching ${filePath}`);
  }
  if (fileExists) citations.push(`current contents of ${filePath}`);

  const recentSteps =
    events
      .map((e) => `- ${e.timestamp} [${e.type}] ${e.summary}`)
      .join("\n") || "(no recorded agent activity for this file)";

  const prompt = [
    `Question from the developer: ${question}`,
    ``,
    `File: ${filePath}`,
    sessionProjectPath ? `Project: ${sessionProjectPath}` : "",
    ``,
    `Recent agent activity on this file:`,
    recentSteps,
    ``,
    `Current file contents (truncated to 4000 chars):`,
    fileExists ? content : "(file not found on disk)",
  ]
    .filter(Boolean)
    .join("\n");

  return { prompt, citations, fileExists, sessionProjectPath };
}
