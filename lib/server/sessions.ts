import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { ChannelKind, ChannelView, CreatedSession, SessionView } from "@/lib/types";

interface SessionRow {
  id: string;
  pin: string;
  title: string;
  source_locale: string;
  status: "live" | "ended";
  secret: string;
  created_at: string;
  expires_at: string;
  local_relay_url: string | null;
  local_relay_expires_at: string | null;
  host_user_id: string | null;
}

interface ChannelRow {
  id: string;
  session_id: string;
  kind: ChannelKind;
  source_locale: string;
  target_locale: string | null;
  label: string;
  sfu_session_id: string | null;
  track_name: string | null;
  is_live: boolean;
  local_stream: string | null;
  local_is_live: boolean;
  updated_at: string;
}

function toView(r: ChannelRow): ChannelView {
  return {
    id: r.id,
    kind: r.kind,
    sourceLocale: r.source_locale,
    targetLocale: r.target_locale,
    label: r.label,
    sfuSessionId: r.sfu_session_id,
    trackName: r.track_name,
    isLive: r.is_live,
    localStream: r.local_stream ?? null,
    localIsLive: r.local_is_live ?? false,
  };
}

/** Create a session with a unique active PIN + a write secret (returned once).
 *
 * `hostUserId` is OPTIONAL owner provenance from the Sunday-Account login: when
 * a signed-in host starts a session it is stamped so the host can later find it
 * in their dashboard. Anonymous create passes null and behaves exactly as
 * before. The stamping itself is best-effort upstream (the API route never
 * fails the create just because owner resolution failed). */
export async function createSession(input: {
  title: string;
  sourceLocale: string;
  churchId?: string | null;
  hostUserId?: string | null;
}): Promise<CreatedSession> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("create_session_owned", {
    p_title: input.title,
    p_source_locale: input.sourceLocale,
    p_host_user_id: input.hostUserId ?? null,
    p_church_id: input.churchId ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; pin: string; secret: string };
  return { id: row.id, pin: row.pin, secret: row.secret };
}

/** A row in the host's "my oversettelses-sesjons" dashboard. */
export interface OwnedSession {
  id: string;
  pin: string;
  title: string;
  sourceLocale: string;
  status: "live" | "ended";
  createdAt: string;
  expiresAt: string;
}

/** List the sessions owned by a given Sunday-Account host, newest first. */
export async function listSessionsByOwner(hostUserId: string): Promise<OwnedSession[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("sessions")
    .select("id, pin, title, source_locale, status, created_at, expires_at")
    .eq("host_user_id", hostUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Array<Omit<SessionRow, "secret" | "local_relay_url" | "local_relay_expires_at" | "host_user_id">> | null) ?? []).map(
    (r) => ({
      id: r.id,
      pin: r.pin,
      title: r.title,
      sourceLocale: r.source_locale,
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }),
  );
}

/** Owner-gated read of a session's PIN + write secret, so the dashboard can
 * deep-link the host back into their operator console. Returns null when the
 * session doesn't exist or isn't owned by this host. */
export async function getOwnedSessionSecret(
  id: string,
  hostUserId: string,
): Promise<{ pin: string; secret: string } | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("sessions")
    .select("pin, secret")
    .eq("id", id)
    .eq("host_user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { pin: string; secret: string } | null;
  return row ? { pin: row.pin, secret: row.secret } : null;
}

/** Owner-gated delete. Returns true if the row belonged to the host and was
 * removed; false if it didn't exist or is owned by someone else (so the route
 * can answer 404 without leaking other hosts' ids). Channels (and captions)
 * cascade via the FK / explicit cleanup. */
export async function deleteSessionOwned(id: string, hostUserId: string): Promise<boolean> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("sessions")
    .delete()
    .eq("id", id)
    .eq("host_user_id", hostUserId)
    .select("id");
  if (error) throw error;
  const deleted = Array.isArray(data) && data.length > 0;
  // captions has no FK cascade to sessions — clear it AFTER the owner-gated
  // delete succeeded (clearing first would let any host wipe another session's
  // captions by guessing its id). Best-effort; lazy GC also sweeps orphans.
  if (deleted) await sb.from("captions").delete().eq("session_id", id);
  return deleted;
}

/** True when the row's 24h TTL has passed — expired sessions must behave as
 * gone even before the lazy GC (which only runs on create) sweeps them. */
function isExpired(r: Pick<SessionRow, "expires_at">): boolean {
  return !!r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
}

/** Resolve a PIN to a live session (no secret). */
export async function sessionByPin(pin: string): Promise<SessionView | null> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("session_by_pin", { p_pin: pin });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; title: string; source_locale: string; status: "live" | "ended" }
    | undefined;
  if (!row) return null;
  // The RPC's fixed return shape doesn't carry the relay url or expiry; enrich
  // it so a listener learns about a local relay — and so an expired-but-not-yet-
  // GC'd session stops resolving.
  const { data: extra } = await sb
    .from("sessions")
    .select("local_relay_url, expires_at")
    .eq("id", row.id)
    .maybeSingle();
  const enrich = extra as { local_relay_url: string | null; expires_at: string } | null;
  if (enrich && isExpired(enrich)) return null;
  return {
    id: row.id,
    title: row.title,
    sourceLocale: row.source_locale,
    status: row.status,
    localRelayUrl: enrich?.local_relay_url ?? null,
  };
}

async function getRow(id: string): Promise<SessionRow | null> {
  const sb = createServiceClient();
  const { data } = await sb.from("sessions").select("*").eq("id", id).maybeSingle();
  return (data as SessionRow | null) ?? null;
}

export async function getSession(id: string): Promise<SessionView | null> {
  const r = await getRow(id);
  if (r && isExpired(r)) return null;
  return r
    ? {
        id: r.id,
        title: r.title,
        sourceLocale: r.source_locale,
        status: r.status,
        localRelayUrl: r.local_relay_url ?? null,
      }
    : null;
}

/** Register (or clear) the local relay that hosts this session. Set by the
 * relay/operator with the session secret; null clears it (back to cloud-only). */
export async function setSessionRelay(
  id: string,
  relayUrl: string | null,
  expiresAt: string | null,
): Promise<void> {
  const sb = createServiceClient();
  await sb
    .from("sessions")
    .update({ local_relay_url: relayUrl, local_relay_expires_at: expiresAt })
    .eq("id", id);
}

/** Constant-time string compare — a plain !== leaks match-length timing. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Verify a write secret against a live, unexpired session. Returns the row or null. */
export async function verifySecret(id: string, secret: string | null): Promise<SessionRow | null> {
  if (!secret) return null;
  const r = await getRow(id);
  if (!r || r.status !== "live" || isExpired(r) || !safeEqual(r.secret, secret)) return null;
  return r;
}

export async function listChannels(sessionId: string): Promise<ChannelView[]> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("channels")
    .select("*")
    .eq("session_id", sessionId)
    .order("kind", { ascending: true })
    .order("target_locale", { ascending: true });
  return ((data as ChannelRow[] | null) ?? []).map(toView);
}

/** Define (or relabel) a channel. Idempotent on (session, kind, target_locale). */
export async function upsertChannel(
  sessionId: string,
  input: { kind: ChannelKind; sourceLocale: string; targetLocale: string | null; label: string },
): Promise<ChannelView> {
  const sb = createServiceClient();
  const match = sb
    .from("channels")
    .select("*")
    .eq("session_id", sessionId)
    .eq("kind", input.kind);
  const { data: existing } = input.targetLocale
    ? await match.eq("target_locale", input.targetLocale).maybeSingle()
    : await match.is("target_locale", null).maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("channels")
      .update({ label: input.label, source_locale: input.sourceLocale, updated_at: new Date().toISOString() })
      .eq("id", (existing as ChannelRow).id)
      .select("*")
      .single();
    if (error) throw error;
    return toView(data as ChannelRow);
  }
  const { data, error } = await sb
    .from("channels")
    .insert({
      session_id: sessionId,
      kind: input.kind,
      source_locale: input.sourceLocale,
      target_locale: input.targetLocale,
      label: input.label,
    })
    .select("*")
    .single();
  if (error) {
    // Concurrent create of the same (session, kind, target) — e.g. two
    // interpreters starting the same language at once — trips the unique
    // index. Treat it as "already exists": re-read and return that row.
    if ((error as { code?: string }).code === "23505") {
      const retry = sb.from("channels").select("*").eq("session_id", sessionId).eq("kind", input.kind);
      const { data: row } = input.targetLocale
        ? await retry.eq("target_locale", input.targetLocale).maybeSingle()
        : await retry.is("target_locale", null).maybeSingle();
      if (row) return toView(row as ChannelRow);
    }
    throw error;
  }
  return toView(data as ChannelRow);
}

/** Remove a channel (operator cleanup of a mistakenly added language). Scoped
 * to the authenticated session. Returns false when nothing matched. */
export async function deleteChannel(sessionId: string, channelId: string): Promise<boolean> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("channels")
    .delete()
    .eq("id", channelId)
    .eq("session_id", sessionId)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/** A publisher (re)registered or dropped a channel. Going live writes the cloud
 * SFU coordinates; going offline only flips `is_live` and keeps the last
 * coordinates (no garbage placeholders). The local-relay coords (mediamtx
 * stream) are written only when the publisher dual-published to a relay
 * (`localStream` provided). Scoped to the authenticated session: the caller's
 * secret was verified against `sessionId`, so the update is constrained to a
 * channel owned by it — a secret-holder for session A can't redirect or knock
 * offline a channel owned by session B. */
export async function setChannelPublish(
  sessionId: string,
  channelId: string,
  input: {
    sfuSessionId?: string | null;
    trackName?: string | null;
    live: boolean;
    localStream?: string | null;
    localLive?: boolean;
  },
): Promise<boolean> {
  const sb = createServiceClient();
  const patch: Record<string, unknown> = {
    is_live: input.live,
    updated_at: new Date().toISOString(),
  };
  if (input.live) {
    patch.sfu_session_id = input.sfuSessionId ?? null;
    patch.track_name = input.trackName ?? null;
  }
  if (input.localStream !== undefined) {
    patch.local_stream = input.localStream;
    patch.local_is_live = input.localLive ?? false;
  }
  const { data, error } = await sb
    .from("channels")
    .update(patch)
    .eq("id", channelId)
    .eq("session_id", sessionId)
    .select("id");
  if (error) throw error;
  // False = the channelId didn't belong to this session; the route answers 404
  // so a publisher learns its registration silently failed.
  return Array.isArray(data) && data.length > 0;
}

export async function endSession(id: string): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("sessions").update({ status: "ended" }).eq("id", id);
  if (error) throw error;
  // Privacy: caption transcripts must not outlive the session ("no audio is
  // recorded" — the text shouldn't linger either). Best-effort cleanup.
  await sb.from("captions").delete().eq("session_id", id);
}

// ── captions (phase 2) ──────────────────────────────────────────────────────

export interface CaptionView {
  locale: string;
  seq: number;
  text: string;
}

/** Store the latest caption line for a (session, locale) — the late-join snapshot. */
export async function upsertCaption(
  sessionId: string,
  locale: string,
  seq: number,
  text: string,
): Promise<void> {
  const sb = createServiceClient();
  // A slow ASR/translate round can finish AFTER a newer chunk already wrote its
  // line; never let the older line clobber the snapshot. (Read-then-write race
  // is acceptable: captions are a hint layer and clients also compare seq.)
  const { data: cur } = await sb
    .from("captions")
    .select("seq")
    .eq("session_id", sessionId)
    .eq("locale", locale)
    .maybeSingle();
  if (cur && Number((cur as { seq: number }).seq) >= seq) return;
  await sb.from("captions").upsert(
    { session_id: sessionId, locale, seq, text, updated_at: new Date().toISOString() },
    { onConflict: "session_id,locale" },
  );
}

export async function getCaptions(sessionId: string): Promise<CaptionView[]> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("captions")
    .select("locale, seq, text")
    .eq("session_id", sessionId);
  return ((data as CaptionView[] | null) ?? []).map((c) => ({
    locale: c.locale,
    seq: Number(c.seq),
    text: c.text,
  }));
}
