"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publishTrack, publishTrackWhip, whipUrl, type PublishHandle, type MediaHandle } from "@/lib/sfu";
import type { ChannelKind } from "@/lib/types";

export type PublishState = "idle" | "connecting" | "live" | "reconnecting" | "error";

/** Give a "disconnected" PC this long to self-heal before re-publishing. */
const DISCONNECT_GRACE_MS = 3_000;
/** Automatic re-publish attempts (exponential backoff, capped) before giving
 * up, marking the channel offline and surfacing the error. */
const MAX_RETRIES = 5;

interface ChannelSpec {
  kind: ChannelKind;
  targetLocale: string | null;
  label: string;
}

interface PublishOpts {
  /** Sound-card / mic input device. */
  deviceId?: string;
  /** "music" preserves the mixer feed (no AGC/NS); "voice" cleans up speech. */
  mode: "music" | "voice";
}

/** Capture mic / sound-card audio and publish it as a session channel.
 * Ensures the channel row exists, pushes the track to the SFU, then registers
 * the SFU coordinates so listeners can subscribe.
 *
 * Self-healing: a dropped peer connection re-publishes automatically with
 * backoff (the mic stays hot), a revoked input (USB sound card unplugged) is
 * detected via track.onended, and closing the tab mid-broadcast marks the
 * channel offline via a keepalive beacon so listeners never see a zombie
 * "live" channel. */
export function usePublisher(
  sessionId: string | null,
  secret: string | null,
  localRelayUrl: string | null = null,
) {
  const [state, setState] = useState<PublishState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const handleRef = useRef<PublishHandle | null>(null);
  const localHandleRef = useRef<MediaHandle | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const trackNameRef = useRef<string>("");
  // Generation counter: bumping it invalidates in-flight publishes, state
  // callbacks and retry timers from a previous go()/stop() cycle.
  const genRef = useRef(0);
  const attemptRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<PublishState>("idle");
  const republishRef = useRef<(gen: number) => void>(() => {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimers = useCallback(() => {
    for (const t of [retryTimer, graceTimer]) {
      if (t.current) {
        clearTimeout(t.current);
        t.current = null;
      }
    }
  }, []);

  /** Best-effort "channel offline" signal. `keepalive` lets it survive a tab
   * close / navigation (pagehide). */
  const markOffline = useCallback(
    (keepalive = false) => {
      const cid = channelIdRef.current;
      if (!sessionId || !secret || !cid) return;
      fetch(`/api/sessions/${sessionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ channelId: cid, live: false }),
        keepalive,
      }).catch(() => {});
    },
    [sessionId, secret],
  );
  const markOfflineRef = useRef(markOffline);
  useEffect(() => {
    markOfflineRef.current = markOffline;
  }, [markOffline]);

  /** Stop everything including the mic (full teardown). */
  const releaseMedia = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    localHandleRef.current?.stop();
    localHandleRef.current = null;
    micRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    micRef.current = null;
  }, []);

  /** Close dead peer connections but KEEP the mic hot for a re-publish.
   * (handle.stop() would stop the mic track itself.) */
  const dropConnections = useCallback(() => {
    handleRef.current?.pc.close();
    handleRef.current = null;
    localHandleRef.current?.pc.close();
    localHandleRef.current = null;
  }, []);

  const stop = useCallback(() => {
    genRef.current++;
    clearTimers();
    attemptRef.current = 0;
    releaseMedia();
    setStream(null);
    setState("idle");
    setError("");
    // Mark the channel offline (best-effort).
    markOffline();
  }, [clearTimers, releaseMedia, markOffline]);

  // Release the mic + peer connections if the page unmounts mid-broadcast,
  // and mark the channel offline so listeners don't chase a dead track.
  useEffect(() => {
    const gen = genRef;
    return () => {
      gen.current++;
      for (const t of [retryTimer, graceTimer]) {
        if (t.current) clearTimeout(t.current);
      }
      handleRef.current?.stop();
      handleRef.current = null;
      localHandleRef.current?.stop();
      localHandleRef.current = null;
      micRef.current?.getTracks().forEach((tr) => {
        tr.onended = null;
        tr.stop();
      });
      micRef.current = null;
      markOfflineRef.current();
    };
  }, []);

  // Tab close / navigation mid-broadcast: flip the channel offline with a
  // keepalive fetch — otherwise it stays "live" in the DB forever.
  useEffect(() => {
    const onPageHide = () => {
      const s = stateRef.current;
      if (s === "live" || s === "reconnecting" || s === "connecting") {
        markOfflineRef.current(true);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const scheduleRepublish = useCallback(
    (gen: number) => {
      if (gen !== genRef.current) return;
      clearTimers();
      dropConnections();
      const attempt = ++attemptRef.current;
      if (attempt > MAX_RETRIES) {
        setError("connection_lost");
        setState("error");
        markOffline();
        return;
      }
      setState("reconnecting");
      const delay = Math.min(8_000, 1_000 * 2 ** (attempt - 1));
      retryTimer.current = setTimeout(() => republishRef.current(gen), delay);
    },
    [clearTimers, dropConnections, markOffline],
  );

  const wireCloud = useCallback(
    (handle: PublishHandle, gen: number) => {
      handleRef.current = handle;
      handle.onState((s) => {
        if (gen !== genRef.current) return;
        if (s === "connected") {
          attemptRef.current = 0;
          clearTimers();
          setState("live");
        } else if (s === "failed" || s === "closed") {
          scheduleRepublish(gen);
        } else if (s === "disconnected") {
          // Frequently transient — grace period before re-publishing.
          if (graceTimer.current) clearTimeout(graceTimer.current);
          graceTimer.current = setTimeout(() => {
            graceTimer.current = null;
            if (gen === genRef.current && handle.pc.connectionState !== "connected") {
              scheduleRepublish(gen);
            }
          }, DISCONNECT_GRACE_MS);
        }
      });
    },
    [clearTimers, scheduleRepublish],
  );

  /** Register the (new) cloud + local coordinates so listeners can subscribe. */
  const register = useCallback(
    async (
      handle: PublishHandle,
      local: { localStream?: string; localLive: boolean } | null,
    ): Promise<Response> => {
      return fetch(`/api/sessions/${sessionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          channelId: channelIdRef.current,
          sfuSessionId: handle.sfuSessionId,
          trackName: handle.trackName,
          live: true,
          ...(localRelayUrl
            ? { localStream: local?.localStream ?? null, localLive: local?.localLive ?? false }
            : {}),
        }),
      });
    },
    [sessionId, secret, localRelayUrl],
  );

  /** Best-effort dual-publish to the local relay; never blocks the cloud path. */
  const publishLocal = useCallback(
    async (mic: MediaStream): Promise<{ localStream?: string; localLive: boolean } | null> => {
      if (!localRelayUrl || !sessionId) return null;
      const path = `${sessionId}_${trackNameRef.current}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      try {
        localHandleRef.current = await publishTrackWhip(
          mic,
          whipUrl(localRelayUrl, path),
          secret ?? undefined,
        );
        return { localStream: path, localLive: true };
      } catch {
        return { localLive: false };
      }
    },
    [localRelayUrl, sessionId, secret],
  );

  /** Re-publish over a fresh SFU session after a dropped connection — the mic
   * stays hot, only the transport is rebuilt. */
  const republish = useCallback(
    async (gen: number) => {
      if (gen !== genRef.current) return;
      const mic = micRef.current;
      if (!mic || !channelIdRef.current || !sessionId || !secret) return;
      const track = mic.getAudioTracks()[0];
      if (!track || track.readyState !== "live") {
        setError("mic_lost");
        setState("error");
        markOffline();
        return;
      }
      try {
        const handle = await publishTrack(mic, trackNameRef.current, sessionId);
        if (gen !== genRef.current) {
          handle.pc.close();
          return;
        }
        wireCloud(handle, gen);
        const local = await publishLocal(mic);
        const res = await register(handle, local);
        if (!res.ok) throw new Error(`register ${res.status}`);
        if (gen !== genRef.current) return;
        const pcState = handle.pc.connectionState;
        if (pcState !== "failed" && pcState !== "closed" && pcState !== "disconnected") {
          setState("live");
        }
      } catch {
        scheduleRepublish(gen);
      }
    },
    [sessionId, secret, wireCloud, publishLocal, register, scheduleRepublish, markOffline],
  );

  useEffect(() => {
    republishRef.current = republish;
  }, [republish]);

  const go = useCallback(
    async (spec: ChannelSpec, opts: PublishOpts) => {
      if (!sessionId || !secret) return;
      // Guard the double-tap: one publish pipeline at a time.
      const s = stateRef.current;
      if (s === "connecting" || s === "live" || s === "reconnecting") return;
      const gen = ++genRef.current;
      clearTimers();
      attemptRef.current = 0;
      setState("connecting");
      setError("");
      try {
        // 1. Ensure the channel exists.
        const chRes = await fetch(`/api/sessions/${sessionId}/channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            kind: spec.kind,
            targetLocale: spec.targetLocale,
            label: spec.label,
          }),
        });
        if (chRes.status === 401) throw new Error("unauthorized");
        const ch = await chRes.json().catch(() => null);
        const channelId: string | undefined = ch?.channel?.id;
        if (!chRes.ok || !channelId) throw new Error("channel");
        channelIdRef.current = channelId;
        if (gen !== genRef.current) return;

        // 2. Capture audio.
        const audio: MediaTrackConstraints =
          opts.mode === "music"
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (opts.deviceId) audio.deviceId = { exact: opts.deviceId };
        const mic = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        if (gen !== genRef.current) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        micRef.current = mic;
        setStream(mic);
        // Watch for the OS revoking the input (USB sound card unplugged, mic
        // taken by another app) — the SFU would otherwise carry silence while
        // the UI still says "live".
        const track = mic.getAudioTracks()[0];
        if (track) {
          track.onended = () => {
            if (gen !== genRef.current) return;
            genRef.current++;
            clearTimers();
            releaseMedia();
            setStream(null);
            markOffline();
            setError("mic_lost");
            setState("error");
          };
        }

        // 3. Publish to the cloud SFU (always — serves 4G listeners + captions).
        trackNameRef.current = `${spec.kind}-${spec.targetLocale ?? "orig"}`;
        const handle = await publishTrack(mic, trackNameRef.current, sessionId);
        if (gen !== genRef.current) {
          handle.pc.close();
          return;
        }
        wireCloud(handle, gen);

        // 3b. Dual-publish to the local relay (best-effort) so on-wifi listeners
        // can pull it locally. A relay failure never blocks the cloud path.
        const local = await publishLocal(mic);

        // 4. Register coordinates so listeners can pull it (cloud + local).
        const res = await register(handle, local);
        if (!res.ok) throw new Error(res.status === 401 ? "unauthorized" : "register");
        if (gen !== genRef.current) return;
        // Don't claim "live" if the PC already died while we registered.
        const pcState = handle.pc.connectionState;
        if (pcState !== "failed" && pcState !== "closed") setState("live");
      } catch (e) {
        if (gen !== genRef.current) return;
        // Release everything captured so far — never leave a hot mic (red
        // recording dot) behind an error screen.
        clearTimers();
        releaseMedia();
        setStream(null);
        setError(e instanceof Error ? e.message : "feil");
        setState("error");
      }
    },
    [sessionId, secret, clearTimers, releaseMedia, markOffline, wireCloud, publishLocal, register],
  );

  return { state, stream, error, go, stop };
}
