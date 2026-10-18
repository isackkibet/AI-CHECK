/**
 * Brainstorm server entry point.
 *
 * Phase 1 MVP: an Express + Socket.IO server that holds an in-memory list of
 * agent events and streams them live to the dashboard. For now the events are
 * sample/fake events so we can prove the backend -> websocket -> React -> live
 * timeline pipeline works end to end. Real Claude Code session watching comes
 * later (Phase 3).
 */
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  type BrainstormEvent,
  type EventType,
  SOCKET_EVENTS,
} from "@brainstorm/shared";

// Re-export the shared types so existing internal references keep working.
export type { BrainstormEvent, EventType };

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:5173";
const SESSION_ID = "session_demo_001";

// In-memory event store. SQLite replaces this in Phase 2.
const events: BrainstormEvent[] = [];
let eventCounter = 0;

function makeEvent(
  type: EventType,
  summary: string,
  filePath?: string,
  evidence?: Record<string, unknown>,
): BrainstormEvent {
  eventCounter += 1;
  return {
    id: `evt_${eventCounter.toString().padStart(4, "0")}`,
    sessionId: SESSION_ID,
    type,
    timestamp: new Date().toISOString(),
    summary,
    filePath,
    evidence,
  };
}

/** Seed a believable sequence of sample agent events so the timeline isn't empty. */
function seedEvents(): void {
  const seed: Array<[EventType, string, string?, Record<string, unknown>?]> = [
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

  // Space the seed timestamps out over the last ~10 minutes so they look real.
  const now = Date.now();
  const stepMs = 60_000; // 1 minute between seed events
  seed.forEach((args, index) => {
    const evt = makeEvent(args[0], args[1], args[2], args[3]);
    evt.timestamp = new Date(now - (seed.length - index) * stepMs).toISOString();
    events.push(evt);
  });
}

/**
 * Pool of live sample events cycled through to simulate an agent actively
 * working. Replaced by the session-log watcher in Phase 3.
 */
const livePool: Array<[EventType, string, string?]> = [
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

let liveIndex = 0;

/**
 * Emit one live event from the pool on each tick and broadcast it to every
 * connected client. Keeps the dashboard feeling "live" for the MVP demo.
 */
function emitLiveEvent(io: Server): void {
  const [type, summary, filePath] = livePool[liveIndex % livePool.length];
  liveIndex += 1;
  const evt = makeEvent(type, summary, filePath, { source: "live_demo" });
  events.push(evt);
  io.emit("event:new", evt);
  console.log(`[event] ${evt.type} - ${evt.summary}`);
}

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

// --- REST API ---

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    eventCount: events.length,
  });
});

app.get("/api/events", (_req, res) => {
  res.json(events);
});

// --- HTTP + WebSocket server ---

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: FRONTEND_ORIGIN, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  // Replay the full history to the newly connected client.
  socket.emit("events:history", events);

  socket.on("disconnect", (reason) => {
    console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
  });
});

// Start the server and the live event feed.
httpServer.listen(PORT, () => {
  console.log(`\n  Brainstorm server`);
  console.log(`  -----------------------------`);
  console.log(`  REST:  http://localhost:${PORT}/api/health`);
  console.log(`  WS:    http://localhost:${PORT} (socket.io)`);
  console.log(`  CORS:  ${FRONTEND_ORIGIN}\n`);

  seedEvents();
  console.log(`[seed] loaded ${events.length} sample events`);

  // Emit a new live event every 4 seconds.
  setInterval(() => emitLiveEvent(io), 4_000);
});
