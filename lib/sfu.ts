"use client";

/**
 * Cloudflare Realtime SFU client (browser side).
 *
 * One-to-many audio broadcast: a publisher (source device or interpreter) pushes
 * a single audio track; many listeners pull it. We talk to Cloudflare's SFU
 * "tracks" API through our /api/rt proxy (which holds the App Token).
 *
 * Publish flow:
 *   1. create an SFU session            POST /sessions/new            → { sessionId }
 *   2. offer the local audio track      POST /sessions/<id>/tracks/new (location:"local")
 *      → SFU answers; we setRemoteDescription(answer)
 *   The (sessionId, trackName) pair is what listeners need to subscribe.
 *
 * Subscribe flow:
 *   1. create an SFU session            POST /sessions/new            → { sessionId }
 *   2. pull the remote track            POST /sessions/<id>/tracks/new (location:"remote")
 *      → SFU returns an OFFER (requiresImmediateRenegotiation)
 *   3. answer it                        PUT  /sessions/<id>/renegotiate (answer)
 *
 * VERIFIED against Cloudflare's official realtime-examples/echo client:
 * base https://rtc.live.cloudflare.com/v1/apps/{APP_ID}; bodies use
 * `sessionDescription` + `tracks[{location,mid,trackName,sessionId}]`; a remote
 * pull returns `requiresImmediateRenegotiation` + an offer we answer. (Audio
 * still needs a live rig test — creds, NAT traversal, iOS — but the API contract
 * is confirmed.)
 */

const RT = "/api/rt";

/** ICE servers. Defaults to Cloudflare's STUN (enough when the client can reach
 * the SFU's public endpoint directly). For restrictive church wifi / cellular,
 * set NEXT_PUBLIC_RT_ICE to a JSON array of RTCIceServer incl. a Cloudflare TURN
 * entry — no code change, just a deploy-time env. */
function parseIce(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_RT_ICE;
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length) return v as RTCIceServer[];
    } catch {
      /* fall through to default */
    }
  }
  return [{ urls: "stun:stun.cloudflare.com:3478" }];
}

const ICE: RTCConfiguration = {
  iceServers: parseIce(),
  bundlePolicy: "max-bundle",
};

interface SdpDesc {
  type: RTCSdpType;
  sdp: string;
}
interface TracksResponse {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: SdpDesc;
  tracks?: Array<{ mid?: string; trackName?: string; error?: string }>;
}

async function rt<T>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  sessionId: string,
): Promise<T> {
  const res = await fetch(`${RT}/${path}`, {
    method,
    // The proxy binds every SFU op to a live session (x-session-id) so the App
    // Token can't be used to mint sessions outside a real SundayTranslate room.
    headers: { "Content-Type": "application/json", "x-session-id": sessionId },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`sfu ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Resolve once ICE gathering finishes (or after a short cap) so the offer
 * carries host/srflx candidates — Cloudflare's SFU is non-trickle friendly. */
function waitIceComplete(pc: RTCPeerConnection, capMs = 1500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    const timer = setTimeout(done, capMs);
  });
}

export interface PublishHandle {
  sfuSessionId: string;
  trackName: string;
  pc: RTCPeerConnection;
  onState: (cb: (s: RTCPeerConnectionState) => void) => void;
  stop: () => void;
}

/** Publish one audio track. `trackName` identifies it to subscribers.
 * `appSessionId` is the SundayTranslate session id (the proxy's auth gate). */
export async function publishTrack(
  stream: MediaStream,
  trackName: string,
  appSessionId: string,
): Promise<PublishHandle> {
  const audio = stream.getAudioTracks()[0];
  if (!audio) throw new Error("no_audio_track");

  const pc = new RTCPeerConnection(ICE);
  const tx = pc.addTransceiver(audio, { direction: "sendonly" });

  let sessionId: string;
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitIceComplete(pc);

    ({ sessionId } = await rt<{ sessionId: string }>("POST", "sessions/new", {}, appSessionId));
    const ans = await rt<TracksResponse>("POST", `sessions/${sessionId}/tracks/new`, {
      sessionDescription: { type: "offer", sdp: pc.localDescription!.sdp },
      tracks: [{ location: "local", mid: tx.mid, trackName }],
    }, appSessionId);
    if (ans.sessionDescription) {
      await pc.setRemoteDescription(ans.sessionDescription as RTCSessionDescriptionInit);
    }
  } catch (err) {
    // Never leak a half-built peer connection; the caller owns the mic track.
    pc.close();
    throw err;
  }

  return {
    sfuSessionId: sessionId,
    trackName,
    pc,
    onState: (cb) => pc.addEventListener("connectionstatechange", () => cb(pc.connectionState)),
    stop: () => {
      audio.stop();
      pc.close();
    },
  };
}

export interface SubscribeHandle {
  pc: RTCPeerConnection;
  onState: (cb: (s: RTCPeerConnectionState) => void) => void;
  stop: () => void;
}

/** Subscribe to a published track. `onStream` fires with the inbound audio.
 * `appSessionId` is the SundayTranslate session id (the proxy's auth gate). */
export async function subscribeTrack(
  remoteSfuSessionId: string,
  trackName: string,
  onStream: (stream: MediaStream) => void,
  appSessionId: string,
): Promise<SubscribeHandle> {
  const pc = new RTCPeerConnection(ICE);
  pc.addEventListener("track", (e) => {
    onStream(e.streams[0] ?? new MediaStream([e.track]));
  });

  try {
    const { sessionId } = await rt<{ sessionId: string }>("POST", "sessions/new", {}, appSessionId);
    const offer = await rt<TracksResponse>("POST", `sessions/${sessionId}/tracks/new`, {
      tracks: [{ location: "remote", sessionId: remoteSfuSessionId, trackName }],
    }, appSessionId);
    if (!offer.sessionDescription) throw new Error("no_offer");

    await pc.setRemoteDescription(offer.sessionDescription as RTCSessionDescriptionInit);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIceComplete(pc);
    await rt("PUT", `sessions/${sessionId}/renegotiate`, {
      sessionDescription: { type: "answer", sdp: pc.localDescription!.sdp },
    }, appSessionId);
  } catch (err) {
    pc.close();
    throw err;
  }

  return {
    pc,
    onState: (cb) => pc.addEventListener("connectionstatechange", () => cb(pc.connectionState)),
    stop: () => pc.close(),
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * LOCAL RELAY transport (WHIP/WHEP) — the on-LAN path.
 *
 * When a church runs the SundayTranslate Relay (a mediamtx-backed box on the
 * local network), audio can stay on the wifi instead of round-tripping to
 * Cloudflare: free, low-latency, in-building. The relay speaks the IETF
 * WHIP (publish) / WHEP (subscribe) standard — a single POST that exchanges an
 * SDP offer for an answer — which is far simpler than Cloudflare's tracks API.
 *
 * These are ADDITIVE: the cloud path above is unchanged. A publisher
 * dual-publishes (cloud + relay) and a listener prefers the relay when it is
 * reachable, else falls back to the cloud. NOTE: untested against a live
 * mediamtx — confirm SDP/answer + resource-DELETE semantics at rig test.
 * ─────────────────────────────────────────────────────────────────────────── */

/** A transport-agnostic media handle (relay path has no SFU session id). */
export interface MediaHandle {
  pc: RTCPeerConnection;
  onState: (cb: (s: RTCPeerConnectionState) => void) => void;
  stop: () => void;
}

const stripSlash = (s: string) => s.replace(/\/+$/, "");
/** WHIP ingest URL for a stream on a relay base, e.g. `<base>/<stream>/whip`. */
export const whipUrl = (base: string, stream: string) => `${stripSlash(base)}/${stream}/whip`;
/** WHEP egress URL for a stream on a relay base, e.g. `<base>/<stream>/whep`. */
export const whepUrl = (base: string, stream: string) => `${stripSlash(base)}/${stream}/whep`;

/** Resolve a WHIP/WHEP `Location` (may be relative) against the request URL. */
function resolveResource(requestUrl: string, location: string): string {
  try {
    return new URL(location, requestUrl).toString();
  } catch {
    return location;
  }
}

/** Cheap reachability probe so a listener can decide local-vs-cloud fast
 * (a failed WebRTC attempt is slow). ANY HTTP response means the relay's HTTPS
 * server answered on the LAN and CORS let us read it → reachable. mediamtx 404s
 * unknown paths (verified v1.9.3, with `access-control-allow-origin: *`), so we
 * must NOT require res.ok — only a network error / timeout / cert failure (which
 * throws) means not reachable, and the listener falls back to the cloud. */
export async function relayReachable(base: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(`${stripSlash(base)}/`, {
      signal: ctrl.signal,
      mode: "cors",
      cache: "no-store",
    });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

/** Publish one audio track to a relay via WHIP. `secret` is the session secret;
 * mediamtx's internal auth expects HTTP Basic as user `publish` (verified the
 * config loads on mediamtx v1.9.3 — NOT a Bearer token). */
export async function publishTrackWhip(
  stream: MediaStream,
  endpoint: string,
  secret?: string,
): Promise<MediaHandle> {
  const audio = stream.getAudioTracks()[0];
  if (!audio) throw new Error("no_audio_track");

  const pc = new RTCPeerConnection(ICE);
  pc.addTransceiver(audio, { direction: "sendonly" });
  await pc.setLocalDescription(await pc.createOffer());
  await waitIceComplete(pc);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      ...(secret ? { Authorization: `Basic ${btoa(`publish:${secret}`)}` } : {}),
    },
    body: pc.localDescription!.sdp,
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`whip ${res.status}`);
  }
  const answer = await res.text();
  const location = res.headers.get("Location");
  const resource = location ? resolveResource(endpoint, location) : null;
  await pc.setRemoteDescription({ type: "answer", sdp: answer });

  return {
    pc,
    onState: (cb) =>
      pc.addEventListener("connectionstatechange", () => cb(pc.connectionState)),
    stop: () => {
      audio.stop();
      pc.close();
      if (resource) void fetch(resource, { method: "DELETE" }).catch(() => {});
    },
  };
}

/** Subscribe to a relay stream via WHEP. `onStream` fires with the audio. */
export async function subscribeTrackWhep(
  endpoint: string,
  onStream: (stream: MediaStream) => void,
): Promise<MediaHandle> {
  const pc = new RTCPeerConnection(ICE);
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.addEventListener("track", (e) => {
    onStream(e.streams[0] ?? new MediaStream([e.track]));
  });

  await pc.setLocalDescription(await pc.createOffer());
  await waitIceComplete(pc);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription!.sdp,
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`whep ${res.status}`);
  }
  const answer = await res.text();
  const location = res.headers.get("Location");
  const resource = location ? resolveResource(endpoint, location) : null;
  await pc.setRemoteDescription({ type: "answer", sdp: answer });

  return {
    pc,
    onState: (cb) =>
      pc.addEventListener("connectionstatechange", () => cb(pc.connectionState)),
    stop: () => {
      pc.close();
      if (resource) void fetch(resource, { method: "DELETE" }).catch(() => {});
    },
  };
}
