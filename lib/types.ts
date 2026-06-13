// Shared shapes between server (DB rows) and client (rendered state).

export type ChannelKind = "original" | "human" | "ai";

/** A channel as the client sees it (no DB-internal fields beyond what's needed
 * to subscribe via the SFU). */
export interface ChannelView {
  id: string;
  kind: ChannelKind;
  sourceLocale: string;
  targetLocale: string | null;
  label: string;
  /** SFU coordinates — present only once a publisher is connected. */
  sfuSessionId: string | null;
  trackName: string | null;
  isLive: boolean;
}

export interface SessionView {
  id: string;
  title: string;
  sourceLocale: string;
  status: "live" | "ended";
}

/** What `POST /api/sessions` hands back — the secret is returned exactly once. */
export interface CreatedSession {
  id: string;
  pin: string;
  secret: string;
}
