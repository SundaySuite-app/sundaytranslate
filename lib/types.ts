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
  /** Cloud SFU coordinates — present only once a publisher is connected. */
  sfuSessionId: string | null;
  trackName: string | null;
  isLive: boolean;
  /** Local-relay (mediamtx) stream path + liveness — present only when a relay
   * hosts this session and the publisher dual-published to it. The listener
   * builds the WHEP URL as `<session.localRelayUrl>/<localStream>/whep`. */
  localStream: string | null;
  localIsLive: boolean;
}

export interface SessionView {
  id: string;
  title: string;
  sourceLocale: string;
  status: "live" | "ended";
  /** Base URL of the church's local relay (mediamtx), or null when none hosts
   * this session. When set, on-wifi listeners prefer it over the cloud SFU. */
  localRelayUrl: string | null;
}

/** What `POST /api/sessions` hands back — the secret is returned exactly once. */
export interface CreatedSession {
  id: string;
  pin: string;
  secret: string;
}
