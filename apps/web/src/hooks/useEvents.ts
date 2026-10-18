import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type BrainstormEvent } from "@brainstorm/shared";

/**
 * WebSocket server URL. Override in development with VITE_SERVER_URL.
 * The backend (apps/server) runs on port 3001 by default.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export interface UseEventsResult {
  /** All known events, oldest first. */
  events: BrainstormEvent[];
  /** True while the socket is connected to the Brainstorm server. */
  connected: boolean;
}

/**
 * Connects to the Brainstorm server over Socket.IO and keeps a live list of
 * agent events in state. On connect the server replays the full history; after
 * that every new event is appended as it arrives.
 */
export function useEvents(): UseEventsResult {
  const [events, setEvents] = useState<BrainstormEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Full replay when a client (re)connects.
    socket.on(SOCKET_EVENTS.HISTORY, (history: BrainstormEvent[]) => {
      setEvents(history);
    });

    // Single live event as the agent works.
    socket.on(SOCKET_EVENTS.NEW, (evt: BrainstormEvent) => {
      setEvents((prev) => [...prev, evt]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { events, connected };
}
