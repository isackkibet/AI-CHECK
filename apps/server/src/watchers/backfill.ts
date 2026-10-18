/**
 * Startup backfill: reads all existing Claude Code session JSONL files
 * directly using Node fs (no chokidar), so history is always loaded on
 * boot regardless of the watcher's glob behaviour.
 *
 * This runs once at startup before the live watcher takes over.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { config } from "../config";
import { addEvent } from "../events/eventStore";
import { upsertSession } from "../database/repository";
import { parseLogLine, extractTitle, decodeProjectDir } from "../parsers/claudeCodeParser";
import { recordFailureFromEvent } from "../failures/grouper";

function sessionIdFromFile(file: string): string {
  return basename(file, ".jsonl");
}

function projectPathFromDir(dir: string): string {
  return decodeProjectDir(basename(dir));
}

function processLines(lines: string[], sessionId: string, projectPath: string): number {
  let added = 0;
  let firstSeen = new Date().toISOString();
  let lastSeen  = firstSeen;
  let started   = false;

  // Create the session row BEFORE inserting events (foreign key requirement).
  upsertSession({ id: sessionId, title: null, projectPath, firstSeen, lastSeen, status: "active" });

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const title = extractTitle(line);
    if (title) {
      upsertSession({ id: sessionId, title, projectPath, firstSeen, lastSeen, status: "active" });
      continue;
    }

    const events = parseLogLine(line);
    for (const evt of events) {
      // Some JSONL entries (queue-operation, file-history-delta) lack a
      // sessionId field; the parser defaults to "unknown" which would fail
      // the foreign key. Override with the session id from the filename.
      evt.sessionId = sessionId;
      if (!started) {
        started = true;
        addEvent({
          id: `${sessionId}:started`,
          sessionId,
          type: "session_started",
          timestamp: evt.timestamp,
          summary: `Session started (${projectPath || sessionId})`,
          evidence: { source: "session_log" },
        });
      }
      if (evt.timestamp < firstSeen) firstSeen = evt.timestamp;
      if (evt.timestamp > lastSeen)  lastSeen  = evt.timestamp;

      if (addEvent(evt)) added++;
      if (evt.type === "tool_error") recordFailureFromEvent(evt);
    }
  }

  if (started) {
    upsertSession({ id: sessionId, title: null, projectPath, firstSeen, lastSeen, status: "active" });
  }
  return added;
}

/** Scan all JSONL files under the Claude projects dir and backfill the DB. */
export function backfillAllSessions(): { sessions: number; events: number } {
  const root = config.claudeLogsDir;
  let totalSessions = 0;
  let totalEvents   = 0;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root).filter(name => {
      try { return statSync(join(root, name)).isDirectory(); } catch { return false; }
    });
  } catch (e) {
    console.warn(`[backfill] cannot read ${root}:`, e);
    return { sessions: 0, events: 0 };
  }

  for (const dirName of projectDirs) {
    const dirPath    = join(root, dirName);
    const projectPath = projectPathFromDir(dirPath);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter(f => f.endsWith(".jsonl"));
    } catch { continue; }

    for (const file of files) {
      const filePath  = join(dirPath, file);
      const sessionId = sessionIdFromFile(file);
      let content: string;
      try { content = readFileSync(filePath, "utf8"); } catch { continue; }
      const lines = content.split("\n");
      const added = processLines(lines, sessionId, projectPath);
      totalEvents += added;
      totalSessions++;
    }
  }

  return { sessions: totalSessions, events: totalEvents };
}
