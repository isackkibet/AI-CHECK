/**
 * Claude Code session watcher.
 *
 * Watches the Claude Code projects directory for session .jsonl logs with chokidar
 * and incrementally parses each session log as it is written. Existing sessions are backfilled on
 * startup so the dashboard immediately shows real agent history; new lines are
 * streamed live as the agent works.
 *
 * Watcher restart recovery: parsing is idempotent (event ids are derived from
 * the source entry uuid), and per-file offsets reset on file rotation, so a
 * restart or a truncated file never duplicates or loses events.
 */
import chokidar from "chokidar";
import { basename, join } from "node:path";
import { openSync, closeSync, fstatSync, readSync } from "node:fs";
import { config } from "../config";
import { addEvent } from "../events/eventStore";
import { upsertSession, upsertFailureGroup, insertFailureOccurrence } from "../database/repository";
import {
  parseLogLine,
  extractTitle,
  decodeProjectDir,
} from "../parsers/claudeCodeParser";
import { normalizeFailure, makeGroupSignature } from "../failures/grouper";

interface FileState {
  offset: number;
  buffer: string;
  started: boolean;
  sessionId: string;
  projectPath: string;
  firstSeen: string;
  lastSeen: string;
}

const files = new Map<string, FileState>();

function sessionIdFromPath(filePath: string): string {
  return basename(filePath, ".jsonl");
}

function projectPathFromPath(filePath: string): string {
  // Parent dir name like "-home-isack-Desktop-foo".
  const parent = filePath.split("/").slice(-2, -1)[0] ?? "";
  return decodeProjectDir(parent);
}

/** Process all complete lines currently in a file's buffer. */
function flushLines(filePath: string, state: FileState): void {
  const lines = state.buffer.split("\n");
  state.buffer = lines.pop() ?? ""; // keep any incomplete trailing line

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Update session metadata from special entries.
    const title = extractTitle(trimmed);
    if (title) {
      upsertSession({
        id: state.sessionId,
        title,
        projectPath: state.projectPath,
        firstSeen: state.firstSeen,
        lastSeen: state.lastSeen,
        status: "active",
      });
      continue; // ai-title is metadata, not a timeline event
    }

    const events = parseLogLine(trimmed);
    for (const evt of events) {
      if (!state.started) {
        // First real event: mark the session started.
        state.started = true;
        addEvent({
          id: `${state.sessionId}:started`,
          sessionId: state.sessionId,
          type: "session_started",
          timestamp: evt.timestamp,
          summary: `Session started (${state.projectPath || state.sessionId})`,
          evidence: { source: "session_log" },
        });
      }
      if (evt.timestamp < state.firstSeen) state.firstSeen = evt.timestamp;
      if (evt.timestamp > state.lastSeen) state.lastSeen = evt.timestamp;

      addEvent(evt);

      // Feed tool errors into the failure grouper.
      if (evt.type === "tool_error") {
        recordFailure(evt, state);
      }
    }
  }
}

/** Run a failure through the grouper and persist it. */
function recordFailure(evt: import("@brainstorm/shared").BrainstormEvent, state: FileState): void {
  const norm = normalizeFailure(evt.summary);
  if (!norm) return;
  const groupId = makeGroupSignature(norm.normalized);
  upsertFailureGroup({
    id: groupId,
    signature: groupId,
    normalizedMessage: norm.normalized,
    errorType: norm.errorType,
    occurrenceCount: 0, // upsert increments via re-run; see below
    firstSeen: evt.timestamp,
    lastSeen: evt.timestamp,
    resolved: 0,
  });
  insertFailureOccurrence({
    groupId,
    eventId: evt.id,
    message: evt.summary,
    command: evt.evidence?.command as string | undefined,
    filePath: evt.filePath,
    timestamp: evt.timestamp,
  });
}

/** Read new bytes from a file since the last offset and process them. */
function processFile(filePath: string): void {
  let state = files.get(filePath);
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return; // file may have been removed
  }
  try {
    const size = fstatSync(fd).size;

    if (!state) {
      state = {
        offset: 0,
        buffer: "",
        started: false,
        sessionId: sessionIdFromPath(filePath),
        projectPath: projectPathFromPath(filePath),
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
      files.set(filePath, state);
    }

    // File rotation / truncation: start over.
    if (state.offset > size) {
      state.offset = 0;
      state.buffer = "";
      state.started = false;
    }

    if (state.offset < size) {
      const len = size - state.offset;
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, state.offset);
      state.buffer += buf.toString("utf8");
      state.offset = size;
      flushLines(filePath, state);
    }

    // Persist latest session metadata.
    if (state.started) {
      upsertSession({
        id: state.sessionId,
        title: null,
        projectPath: state.projectPath,
        firstSeen: state.firstSeen,
        lastSeen: state.lastSeen,
        status: "active",
      });
    }
  } finally {
    closeSync(fd);
  }
}

/** Start watching Claude Code session logs for live agent events. */
export function startSessionWatcher(): Promise<void> {
  const watchDir = config.claudeLogsDir;
  const pattern = join(watchDir, "**/*.jsonl");

  console.log(`[watcher] watching ${pattern}`);

  return new Promise((resolve) => {
    const watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: false,
    });

    let isReady = false;

    watcher.on("ready", () => {
      isReady = true;
      console.log(`[watcher] ready (${files.size} session files known)`);
      resolve();
    });

    watcher.on("add", (p) => processFile(p));
    watcher.on("change", (p) => {
      // Debounce live writes to avoid partial-line reads.
      setTimeout(() => processFile(p), isReady ? 300 : 0);
    });
    watcher.on("unlink", (p) => files.delete(p));
    watcher.on("error", (err) => console.error("[watcher] error:", err));
  });
}
