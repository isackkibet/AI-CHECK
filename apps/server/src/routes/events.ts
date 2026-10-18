import { type Express } from "express";
import { countEvents } from "../events/eventStore";
import { queryEvents } from "../database/repository";
import { getDb } from "../database/db";

/** Mount event + session + health REST routes. */
export function mountEventRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      eventCount: countEvents(),
    });
  });

  app.get("/api/events", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 500), 2000);
    const sessionId =
      (req.query.sessionId as string | undefined)?.trim() || undefined;
    res.json(queryEvents(limit, sessionId));
  });

  app.get("/api/sessions", (_req, res) => {
    const rows = getDb()
      .prepare(
        "SELECT id, title, project_path AS projectPath, first_seen AS firstSeen, last_seen AS lastSeen, status FROM sessions ORDER BY last_seen DESC",
      )
      .all();
    res.json(rows);
  });
}
