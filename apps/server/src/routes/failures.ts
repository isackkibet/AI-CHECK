import { type Express } from "express";
import { getFailureGroups } from "../database/repository";
import { setFailureResolved } from "../failures/grouper";
import { getDb } from "../database/db";

/** Mount failure-grouping routes. */
export function mountFailureRoutes(app: Express): void {
  /** All failure groups ranked by occurrence count. */
  app.get("/api/failures", (_req, res) => {
    res.json(getFailureGroups());
  });

  /** A single group plus its most recent occurrences (evidence). */
  app.get("/api/failures/:id", (req, res) => {
    const id = req.params.id;
    const group = getDb()
      .prepare(
        "SELECT id, signature, normalized_message AS normalizedMessage, error_type AS errorType, occurrence_count AS occurrenceCount, first_seen AS firstSeen, last_seen AS lastSeen, resolved FROM failure_groups WHERE id = ?",
      )
      .get(id);
    const occurrences = getDb()
      .prepare(
        "SELECT event_id AS eventId, message, command, exit_code AS exitCode, file_path AS filePath, timestamp FROM failure_occurrences WHERE group_id = ? ORDER BY timestamp DESC LIMIT 50",
      )
      .all(id);
    if (!group) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ group, occurrences });
  });

  /** Mark a failure group resolved (or unresolved). */
  app.post("/api/failures/:id/resolve", (req, res) => {
    setFailureResolved(req.params.id, req.body?.resolved !== false);
    res.json({ ok: true });
  });
}
