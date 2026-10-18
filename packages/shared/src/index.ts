/**
 * Shared types used by both the Brainstorm backend (apps/server) and the
 * dashboard (apps/web). Keeping them in one place means the server and the
 * frontend never disagree about the shape of an event.
 */

/**
 * Every observation Brainstorm makes (a file read, a file edit, a tool call,
 * an error, a test result, ...) is normalized into this common shape. The
 * frontend never needs to understand the original Claude Code log format; it
 * only ever deals with `BrainstormEvent`.
 */
export interface BrainstormEvent {
  /** Stable unique id, e.g. "evt_0007". */
  id: string;
  /** The session this event belongs to. */
  sessionId: string;
  /** Normalized event category. */
  type: EventType;
  /** ISO-8601 timestamp of when the event was observed. */
  timestamp: string;
  /** Short human-readable description, later replaced/extended by AI labels. */
  summary: string;
  /** File path the event touched, if any. */
  filePath?: string;
  /** Raw evidence backing the event (tool name, command, exit code, etc.). */
  evidence?: Record<string, unknown>;
}

/**
 * Brainstorm's normalized event categories. These are not necessarily the
 * literal event names used by Claude Code; they are the categories Brainstorm
 * converts source observations into.
 */
export type EventType =
  | "session_started"
  | "session_ended"
  | "file_read"
  | "file_edit"
  | "tool_call"
  | "tool_result"
  | "command_run"
  | "tool_error"
  | "test_result"
  | "agent_step";

/** Socket.IO event names shared between server and client. */
export const SOCKET_EVENTS = {
  /** Server -> client: full history of events for replay on connect. */
  HISTORY: "events:history",
  /** Server -> client: a single new live event. */
  NEW: "event:new",
} as const;

/** Metadata describing the server's health, returned by GET /api/health. */
export interface HealthResponse {
  status: "ok";
  uptimeSeconds: number;
  eventCount: number;
}
