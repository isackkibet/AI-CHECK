/**
 * Brainstorm server entry point.
 *
 * Wires up Express (REST), Socket.IO (live events), the SQLite event store,
 * the demo emitter (optional) and the Claude Code session watcher. Routes for
 * the codebase map, failures and AI features are mounted from their modules.
 */
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { SOCKET_EVENTS } from "@brainstorm/shared";
import { config, aiEnabled, nemotronEnabled } from "./config";
import { getDb, closeDb } from "./database/db";
import {
  subscribe,
  getAllEvents,
  countEvents,
} from "./events/eventStore";
import {
  seedSampleEvents,
  startSampleEmitter,
} from "./events/sampleEmitter";
import { mountEventRoutes } from "./routes/events";
import { startSessionWatcher } from "./watchers/sessionWatcher";
import { backfillAllSessions } from "./watchers/backfill";
import { mountCodebaseRoutes } from "./routes/codebase";
import { mountFailureRoutes } from "./routes/failures";
import { mountAiRoutes } from "./routes/ai";

const app = express();
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

// --- REST API (route modules) ---
mountEventRoutes(app);
mountCodebaseRoutes(app);
mountFailureRoutes(app);
mountAiRoutes(app);

// --- HTTP + WebSocket server ---
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.frontendOrigin, methods: ["GET", "POST"] },
});

// Push every newly-added event to all connected clients.
subscribe((evt) => {
  io.emit(SOCKET_EVENTS.NEW, evt);
});

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  // Replay the full history to the newly connected client.
  socket.emit(SOCKET_EVENTS.HISTORY, getAllEvents());
  socket.on("disconnect", (reason) =>
    console.log(`[socket] client disconnected: ${socket.id} (${reason})`),
  );
});

// --- Start ---
httpServer.listen(config.port, () => {
  // Initialize the database (creates file + schema if needed).
  getDb();

  // Backfill all existing Claude Code session history synchronously so the
  // dashboard has data immediately on first load.
  if (config.watchClaudeSessions) {
    const { sessions, events: evts } = backfillAllSessions();
    console.log(`[backfill] loaded ${evts} events from ${sessions} session files`);
  }

  console.log(`\n  Brainstorm server`);
  console.log(`  -----------------------------`);
  console.log(`  REST:  http://localhost:${config.port}/api/health`);
  console.log(`  WS:    http://localhost:${config.port} (socket.io)`);
  console.log(`  CORS:  ${config.frontendOrigin}`);
  console.log(`  AI:    ${aiEnabled ? "Claude enabled" : "Claude disabled (set ANTHROPIC_API_KEY)"}`);
  console.log(`  Bulk:  ${nemotronEnabled ? "Nemotron enabled" : "Nemotron disabled (set NVIDIA_API_KEY)"}`);
  console.log(`  Watch: ${config.watchClaudeSessions ? "Claude Code sessions" : "off"}\n`);

  // Optional demo events so the dashboard is never empty.
  if (config.demoMode) {
    const seeded = seedSampleEvents();
    console.log(`[demo] seeded ${seeded} sample events`);
    startSampleEmitter();
  }

  // Real Claude Code session log watcher.
  if (config.watchClaudeSessions) {
    startSessionWatcher().catch((err) =>
      console.error("[watcher] failed to start:", err),
    );
  }
});

// Graceful shutdown: close the database.
process.on("SIGINT", () => {
  console.log("\n[server] shutting down...");
  closeDb();
  process.exit(0);
});
