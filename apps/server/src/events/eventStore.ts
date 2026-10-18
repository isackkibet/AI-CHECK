/**
 * High-level event store. This is the single place the rest of the server goes
 * to add or read events. It persists to SQLite (idempotently) and notifies
 * subscribers whenever a genuinely new event arrives, which the WebSocket
 * layer uses to push live updates to the dashboard.
 */
import { type BrainstormEvent } from "@brainstorm/shared";
import { insertEvent, queryEvents, getEventCount } from "../database/repository";

type Listener = (evt: BrainstormEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to newly-added events. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Add an event. Persists it (idempotent by id) and notifies subscribers only if
 * it was actually new. Returns true if the event was newly inserted.
 */
export function addEvent(evt: BrainstormEvent): boolean {
  const inserted = insertEvent(evt);
  if (inserted) {
    for (const l of listeners) l(evt);
  }
  return inserted;
}

/** Add many events; returns how many were newly inserted. */
export function addEvents(events: BrainstormEvent[]): number {
  let count = 0;
  for (const evt of events) if (addEvent(evt)) count += 1;
  return count;
}

/** Newest-first events for the timeline (capped to avoid huge payloads). */
export function getAllEvents(limit = 500): BrainstormEvent[] {
  return queryEvents(limit);
}

export function countEvents(): number {
  return getEventCount();
}
