// Realtime channel + event names. Shared by client (subscribe) and server
// (broadcast). Keyed by the session UUID — never the guessable PIN, which only
// resolves to an id at join time. Broadcast is a hint layer; clients refetch
// authoritative state (the channel list) on each event and on reconnect.

export const channels = {
  /** Channel list + lifecycle + captions for one live session. */
  session: (sessionId: string) => `translator:session:${sessionId}`,
  /** Anonymous listener presence for one live session (operator head-count).
   * Separate topic so presence traffic never disturbs the broadcast bus. */
  presence: (sessionId: string) => `translator:presence:${sessionId}`,
} as const;

export const events = {
  /** The channel list changed — someone published or stopped. Refetch. */
  channels: "channels",
  /** Lifecycle: payload { status: "live" | "ended" }. */
  session: "session",
  /** A publisher's speaking state toggled: { channelId, on }. */
  speaking: "speaking",
  /** Phase 2 — a translated caption line: { locale, seq, text }. */
  caption: "caption",
} as const;
