/**
 * Failure grouper.
 *
 * Takes tool_error events and collapses repeated identical/near-identical
 * errors into a single failure group, so the dashboard can show "npm test
 * failed: cannot find module './auth' — 14 occurrences" instead of 14 separate
 * rows. Normalization strips the volatile parts of a message (paths, numbers,
 * timestamps) to produce a stable signature.
 */
import { type BrainstormEvent } from "@brainstorm/shared";
import { getDb } from "../database/db";

export interface NormalizedFailure {
  normalized: string;
  errorType: string;
}

/** Strip volatile parts of an error message to get a stable signature. */
export function normalizeFailure(message: string): NormalizedFailure | null {
  if (!message) return null;
  let m = message;

  // Detect an error type prefix when present.
  let errorType = "generic";
  const typeMatch = m.match(
    /^(Error|TypeError|ReferenceError|SyntaxError|RangeError|ModuleError|CommandError):\s*/i,
  );
  if (typeMatch) {
    errorType = typeMatch[1].toLowerCase().replace("error", "") || "error";
    m = m.slice(typeMatch[0].length);
  }
  if (/cannot find module/i.test(m)) errorType = "missing-module";
  else if (/permission denied/i.test(m)) errorType = "permission";
  else if (/command not found/i.test(m)) errorType = "command-not-found";
  else if (/syntaxerror|unexpected token/i.test(m)) errorType = "syntax";
  else if (/test failed|tests? failed/i.test(m)) errorType = "test";
  else if (/timeout/i.test(m)) errorType = "timeout";

  // Remove volatile substrings.
  m = m
    .replace(/\/[\w./~+-]*\.(ts|tsx|js|jsx|json|py|go|rs|java)\b/g, "<path>") // file paths
    .replace(/\/(?:home|Users)[\w/-]+/g, "<path>") // absolute home paths
    .replace(/\b\d+(\.\d+)?\b/g, "N") // numbers, exit codes, counts
    .replace(/\b[0-9a-f]{8,}\b/g, "<hash>") // hex ids / hashes
    .replace(/\b\d{2}:\d{2}(:\d{2})?\b/g, "<time>") // times
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!m) return null;
  return { normalized: m.slice(0, 200), errorType };
}

/** A deterministic group id from the normalized signature. */
export function makeGroupSignature(normalized: string): string {
  // Simple non-cryptographic hash (djb2) -> stable short id.
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 33) ^ normalized.charCodeAt(i);
  }
  return `fail_${(h >>> 0).toString(36)}`;
}

/** Upsert the group for a failure and record one occurrence. */
export function recordFailureFromEvent(evt: BrainstormEvent): void {
  const norm = normalizeFailure(evt.summary);
  if (!norm) return;
  const groupId = makeGroupSignature(norm.normalized);
  const db = getDb();

  // Increment the group on every occurrence; create on first sight.
  db.prepare(
    `INSERT INTO failure_groups
       (id, signature, normalized_message, error_type, occurrence_count, first_seen, last_seen, resolved)
     VALUES (@id, @sig, @msg, @type, 1, @ts, @ts, 0)
     ON CONFLICT(signature) DO UPDATE SET
       occurrence_count = failure_groups.occurrence_count + 1,
       last_seen        = excluded.last_seen`,
  ).run({
    id: groupId,
    sig: groupId,
    msg: norm.normalized,
    type: norm.errorType,
    ts: evt.timestamp,
  });

  db.prepare(
    `INSERT INTO failure_occurrences
       (group_id, event_id, message, command, exit_code, file_path, timestamp)
     VALUES (@groupId, @eventId, @message, @command, @exitCode, @filePath, @timestamp)`,
  ).run({
    groupId,
    eventId: evt.id,
    message: evt.summary,
    command: (evt.evidence?.command as string | undefined) ?? null,
    exitCode: (evt.evidence?.exitCode as number | undefined) ?? null,
    filePath: evt.filePath ?? null,
    timestamp: evt.timestamp,
  });
}

/** Mark all occurrences of a group resolved (or unresolved). */
export function setFailureResolved(groupId: string, resolved: boolean): void {
  getDb()
    .prepare("UPDATE failure_groups SET resolved = ? WHERE id = ?")
    .run(resolved ? 1 : 0, groupId);
}
