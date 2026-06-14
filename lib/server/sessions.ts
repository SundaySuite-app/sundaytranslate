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

/** Create a session with a unique active PIN + a write secret (returned once). */
export async function createSession(input: {
  title: string;
  sourceLocale: string;
  churchId?: string | null;
}): Promise<CreatedSession> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("create_session", {
    p_title: input.title,
    p_source_locale: input.sourceLocale,
    p_church_id: input.churchId ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; pin: string; secret: string };
  return { id: row.id, pin: row.pin, secret: row.secret };
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
  // The RPC's fixed return shape doesn't carry the relay url; enrich it so a
  // listener resolving by PIN learns whether a local relay hosts this session.
  const { data: relay } = await sb
    .from("sessions")
    .select("local_relay_url")
    .eq("id", row.id)
    .maybeSingle();
  return {
    id: row.id,
    title: row.title,
    sourceLocale: row.source_locale,
    status: row.status,
    localRelayUrl: (relay as { local_relay_url: string | null } | null)?.local_relay_url ?? null,
  };
}

async function getRow(id: string): Promise<SessionRow | null> {
  const sb = createServiceClient();
  const { data } = await sb.from("sessions").select("*").eq("id", id).maybeSingle();
  return (data as SessionRow | null) ?? null;
}

export async function getSession(id: string): Promise<SessionView | null> {
  const r = await getRow(id);
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

/** Verify a write secret against a live session. Returns the row or null. */
export async function verifySecret(id: string, secret: string | null): Promise<SessionRow | null> {
  if (!secret) return null;
  const r = await getRow(id);
  if (!r || r.status !== "live" || r.secret !== secret) return null;
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
    const { data } = await sb
      .from("channels")
      .update({ label: input.label, source_locale: input.sourceLocale, updated_at: new Date().toISOString() })
      .eq("id", (existing as ChannelRow).id)
      .select("*")
      .single();
    return toView(data as ChannelRow);
  }
  const { data } = await sb
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
  return toView(data as ChannelRow);
}

/** A publisher (re)registered or dropped a channel's coordinates. Cloud SFU
 * coords are always written; the local-relay coords (mediamtx stream) are
 * written only when the publisher dual-published to a relay (`localStream`
 * provided). */
export async function setChannelPublish(
  channelId: string,
  input: {
    sfuSessionId: string;
    trackName: string;
    live: boolean;
    localStream?: string | null;
    localLive?: boolean;
  },
): Promise<void> {
  const sb = createServiceClient();
  const patch: Record<string, unknown> = {
    sfu_session_id: input.sfuSessionId,
    track_name: input.trackName,
    is_live: input.live,
    updated_at: new Date().toISOString(),
  };
  if (input.localStream !== undefined) {
    patch.local_stream = input.localStream;
    patch.local_is_live = input.localLive ?? false;
  }
  await sb.from("channels").update(patch).eq("id", channelId);
}

export async function endSession(id: string): Promise<void> {
  const sb = createServiceClient();
  await sb.from("sessions").update({ status: "ended" }).eq("id", id);
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
