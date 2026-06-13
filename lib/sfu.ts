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
 * NOTE: exact request/response shapes follow the stable Cloudflare Calls API.
 * Confirm against a live Realtime app during the rig test (needs real creds).
 */

const RT = "/api/rt";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
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

async function rt<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RT}/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
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
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, capMs);
  });
}

export interface PublishHandle {
  sfuSessionId: string;
  trackName: string;
  pc: RTCPeerConnection;
  onState: (cb: (s: RTCPeerConnectionState) => void) => void;
  stop: () => void;
}

/** Publish one audio track. `trackName` identifies it to subscribers. */
export async function publishTrack(
  stream: MediaStream,
  trackName: string,
): Promise<PublishHandle> {
  const audio = stream.getAudioTracks()[0];
  if (!audio) throw new Error("no_audio_track");

  const pc = new RTCPeerConnection(ICE);
  const tx = pc.addTransceiver(audio, { direction: "sendonly" });

  await pc.setLocalDescription(await pc.createOffer());
  await waitIceComplete(pc);

  const { sessionId } = await rt<{ sessionId: string }>("POST", "sessions/new", {});
  const ans = await rt<TracksResponse>("POST", `sessions/${sessionId}/tracks/new`, {
    sessionDescription: { type: "offer", sdp: pc.localDescription!.sdp },
    tracks: [{ location: "local", mid: tx.mid, trackName }],
  });
  if (ans.sessionDescription) {
    await pc.setRemoteDescription(ans.sessionDescription as RTCSessionDescriptionInit);
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

/** Subscribe to a published track. `onStream` fires with the inbound audio. */
export async function subscribeTrack(
  remoteSfuSessionId: string,
  trackName: string,
  onStream: (stream: MediaStream) => void,
): Promise<SubscribeHandle> {
  const pc = new RTCPeerConnection(ICE);
  pc.addEventListener("track", (e) => {
    onStream(e.streams[0] ?? new MediaStream([e.track]));
  });

  const { sessionId } = await rt<{ sessionId: string }>("POST", "sessions/new", {});
  const offer = await rt<TracksResponse>("POST", `sessions/${sessionId}/tracks/new`, {
    tracks: [{ location: "remote", sessionId: remoteSfuSessionId, trackName }],
  });
  if (!offer.sessionDescription) throw new Error("no_offer");

  await pc.setRemoteDescription(offer.sessionDescription as RTCSessionDescriptionInit);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIceComplete(pc);
  await rt("PUT", `sessions/${sessionId}/renegotiate`, {
    sessionDescription: { type: "answer", sdp: pc.localDescription!.sdp },
  });

  return {
    pc,
    onState: (cb) => pc.addEventListener("connectionstatechange", () => cb(pc.connectionState)),
    stop: () => pc.close(),
  };
}
