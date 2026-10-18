/**
 * Parser for Claude Code session JSONL logs.
 *
 * Each line of a session file is one JSON object. This module converts the
 * meaningful entry types (assistant tool_use, user tool_result, file-history
 * deltas, ...) into normalized BrainstormEvents. It is intentionally stateless
 * and idempotent: the same line always yields events with the same ids, so
 * re-parsing a log on watcher restart never duplicates events.
 *
 * Log content is treated strictly as untrusted data, never as instructions.
 */
import { type BrainstormEvent, type EventType } from "@brainstorm/shared";

/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted log JSON */

type ContentBlock = { type: string; [k: string]: any };
type LogEntry = { type: string; [k: string]: any };

/** Map a Claude Code tool name to a normalized event type. */
function toolNameToEventType(name: string): EventType {
  switch (name) {
    case "Read":
      return "file_read";
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return "file_edit";
    case "Bash":
      return "command_run";
    case "Grep":
    case "Glob":
    case "Task":
    case "TodoWrite":
    case "WebSearch":
    case "WebFetch":
      return "tool_call";
    default:
      return "tool_call";
  }
}

/** A short human label for a tool_use block. */
function summaryForToolUse(name: string, input: any): string {
  const fp = input?.file_path ?? input?.path ?? input?.notebook_path;
  switch (name) {
    case "Read":
      return fp ? `Read ${fp}` : "Read file";
    case "Write":
      return fp ? `Wrote ${fp}` : "Wrote file";
    case "Edit":
    case "MultiEdit":
      return fp ? `Edited ${fp}` : "Edited file";
    case "Bash":
      return input?.command ? `Ran: ${truncate(String(input.command), 80)}` : "Ran command";
    case "Grep":
      return input?.pattern ? `Searched for ${truncate(String(input.pattern), 60)}` : "Searched code";
    case "Glob":
      return input?.pattern ? `Listed ${truncate(String(input.pattern), 60)}` : "Listed files";
    case "WebSearch":
      return input?.query ? `Web search: ${truncate(String(input.query), 60)}` : "Web search";
    case "WebFetch":
      return "Fetched URL";
    case "TodoWrite":
      return "Updated task list";
    case "Task":
      return "Launched subtask";
    default:
      return `Tool: ${name}`;
  }
}

/** Build evidence for a tool_use block (kept small to avoid huge DB rows). */
function evidenceForToolUse(name: string, input: any): Record<string, unknown> {
  const ev: Record<string, unknown> = { tool: name, source: "session_log" };
  const fp = input?.file_path ?? input?.path;
  if (fp) ev.filePath = fp;
  if (input?.command) ev.command = truncate(String(input.command), 200);
  if (input?.pattern) ev.pattern = truncate(String(input.pattern), 120);
  if (input?.query) ev.query = truncate(String(input.query), 120);
  return ev;
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

/** Make a relative-ish file path for display when a cwd is known. */
function relPath(p: string | undefined, cwd?: string): string | undefined {
  if (!p) return undefined;
  if (cwd && p.startsWith(cwd + "/")) return p.slice(cwd.length + 1);
  return p;
}

/** Parse one JSONL line into zero or more normalized events. */
export function parseLogLine(line: string): BrainstormEvent[] {
  let entry: LogEntry;
  try {
    entry = JSON.parse(line);
  } catch {
    return []; // skip malformed lines silently
  }

  const sessionId: string = entry.sessionId ?? "unknown";
  const timestamp: string = entry.timestamp ?? new Date().toISOString();
  const entryUuid: string = entry.uuid ?? `${sessionId}:${timestamp}`;
  const cwd: string | undefined = entry.cwd;
  const events: BrainstormEvent[] = [];

  const make = (
    id: string,
    type: EventType,
    summary: string,
    filePath?: string,
    evidence?: Record<string, unknown>,
  ): BrainstormEvent => ({
    id,
    sessionId,
    type,
    timestamp,
    summary,
    filePath: relPath(filePath, cwd),
    evidence,
  });

  switch (entry.type) {
    case "assistant": {
      const blocks: ContentBlock[] = Array.isArray(entry.message?.content)
        ? entry.message.content
        : [];
      blocks.forEach((block, i) => {
        if (block.type === "tool_use") {
          const name = String(block.name ?? "Unknown");
          const input = block.input ?? {};
          const type = toolNameToEventType(name);
          const fp = input.file_path ?? input.path ?? input.notebook_path;
          events.push(
            make(
              `${entryUuid}:tool_use:${block.id ?? i}`,
              type,
              summaryForToolUse(name, input),
              fp,
              evidenceForToolUse(name, input),
            ),
          );
        } else if (block.type === "text" && typeof block.text === "string") {
          const text = truncate(block.text, 140);
          if (text) {
            events.push(
              make(`${entryUuid}:text:${i}`, "agent_step", text, undefined, {
                source: "session_log",
              }),
            );
          }
        }
        // "thinking" blocks are ignored: private reasoning, not an action.
      });
      break;
    }

    case "user": {
      const blocks: ContentBlock[] = Array.isArray(entry.message?.content)
        ? entry.message.content
        : [];
      blocks.forEach((block, i) => {
        if (block.type === "tool_result") {
          const isError = block.is_error === true;
          const content = typeof block.content === "string" ? block.content : "";
          const summary = isError
            ? `Error: ${truncate(content, 120) || "tool failed"}`
            : `Result: ${truncate(content, 80) || "ok"}`;
          events.push(
            make(
              `${entryUuid}:tool_result:${block.tool_use_id ?? i}`,
              isError ? "tool_error" : "tool_result",
              summary,
              undefined,
              {
                source: "session_log",
                toolUseId: block.tool_use_id,
                isError,
                snippet: truncate(content, 300),
              },
            ),
          );
        }
      });
      break;
    }

    case "file-history-delta": {
      const trackingPath = entry.trackingPath;
      const realParent =
        entry.backup?.realParentDir ?? entry.backup?.backupTime;
      events.push(
        make(
          `${entryUuid}:fhd:${trackingPath ?? "unknown"}`,
          "file_edit",
          trackingPath ? `Changed ${trackingPath}` : "File changed",
          trackingPath,
          { source: "file_history", realParentDir: realParent ?? undefined },
        ),
      );
      break;
    }

    case "ai-title": {
      // Used by the watcher to set the session title; not a timeline event.
      break;
    }

    default:
      // queue-operation, attachment, cost-state, etc. are not surfaced as
      // timeline events. cost-state is consumed separately for stats.
      break;
  }

  return events;
}

/** Extract the AI-generated session title from an entry, if present. */
export function extractTitle(line: string): string | null {
  try {
    const entry: LogEntry = JSON.parse(line);
    if (entry.type === "ai-title" && typeof entry.aiTitle === "string") {
      return entry.aiTitle;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Extract cost/usage stats from a cost-state entry, if present. */
export function extractCostStats(line: string): {
  linesAdded: number;
  linesRemoved: number;
  totalCostUsd: number;
} | null {
  try {
    const entry: LogEntry = JSON.parse(line);
    if (entry.type === "cost-state") {
      return {
        linesAdded: Number(entry.totalLinesAdded ?? 0),
        linesRemoved: Number(entry.totalLinesRemoved ?? 0),
        totalCostUsd: Number(entry.totalCostUSD ?? 0),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Decode a Claude Code projects dir name back to a filesystem path. */
export function decodeProjectDir(dir: string): string {
  // "/home/isack/Desktop/foo" -> "-home-isack-Desktop-foo"
  // Replace the leading dash (the root slash) and inner dashes with slashes.
  return dir.replace(/-/g, "/");
}
