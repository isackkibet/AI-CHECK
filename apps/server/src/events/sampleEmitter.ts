/**
 * Demo event emitter. Produces a believable sequence of fake agent events so
 * the dashboard is never empty and the live pipeline can be demoed without a
 * real Claude Code session running. Disabled by default; enabled with
 * BRAINSTORM_DEMO=true. The real session-log watcher (src/watchers) replaces
 * this for live use.
 */
import { type BrainstormEvent, type EventType } from "@brainstorm/shared";
import { addEvent } from "./eventStore";

const SESSION_ID = "session_demo_001";
let counter = 0;

function make(
  type: EventType,
  summary: string,
  filePath?: string,
  evidence?: Record<string, unknown>,
): BrainstormEvent {
  counter += 1;
  return {
    id: `evt_demo_${counter.toString().padStart(4, "0")}`,
    sessionId: SESSION_ID,
    type,
    timestamp: new Date().toISOString(),
    summary,
    filePath,
    evidence: { source: "live_demo", ...evidence },
  };
}

const SEED: Array<[EventType, string, string?, Record<string, unknown>?]> = [
  ["session_started", "Agent started working on authentication"],
  ["file_read", "Read project dependencies", "package.json", { tool: "Read" }],
  ["file_read", "Inspected existing user model", "src/models/User.ts", { tool: "Read" }],
  ["file_edit", "Added password verification", "src/controllers/auth.ts", { tool: "Edit" }],
  ["file_edit", "Connected login endpoint", "src/routes/auth.ts", { tool: "Edit" }],
  ["command_run", "Installed bcrypt dependency", undefined, { command: "npm install bcrypt" }],
  ["tool_error", "npm test failed: cannot find module './auth'", undefined, { command: "npm test", exitCode: 1 }],
  ["file_edit", "Fixed import path in user routes", "src/routes/user.js", { tool: "Edit" }],
  ["test_result", "Tests passed", undefined, { command: "npm test", exitCode: 0 }],
  ["agent_step", "Authentication implementation complete"],
];

const LIVE_POOL: Array<[EventType, string, string?]> = [
  ["file_read", "Read middleware configuration", "src/middleware/auth.ts"],
  ["file_edit", "Updated token validation logic", "src/middleware/auth.ts"],
  ["tool_call", "Ran grep for unused imports", undefined],
  ["file_read", "Inspected route definitions", "src/routes/index.ts"],
  ["file_edit", "Refactored error handler", "src/utils/errors.ts"],
  ["command_run", "Ran linter", undefined],
  ["tool_error", "Type error: missing return type", undefined],
  ["file_edit", "Added return type annotation", "src/utils/errors.ts"],
  ["test_result", "All tests passing", undefined],
  ["agent_step", "Continuing review of auth module"],
];

/** Seed a one-time history of sample events (timestamps spaced over ~10 min). */
export function seedSampleEvents(): number {
  const now = Date.now();
  let added = 0;
  SEED.forEach((args, index) => {
    const evt = make(args[0], args[1], args[2], args[3]);
    evt.timestamp = new Date(now - (SEED.length - index) * 60_000).toISOString();
    if (addEvent(evt)) added += 1;
  });
  return added;
}

/** Start emitting live sample events on an interval. Returns a stop function. */
export function startSampleEmitter(intervalMs = 4_000): () => void {
  let i = 0;
  const timer = setInterval(() => {
    const [type, summary, filePath] = LIVE_POOL[i % LIVE_POOL.length];
    i += 1;
    addEvent(make(type, summary, filePath));
  }, intervalMs);
  return () => clearInterval(timer);
}
