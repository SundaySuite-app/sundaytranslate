"use client";

import { useCallback, useRef, useState } from "react";
import { publishTrack, type PublishHandle } from "@/lib/sfu";
import type { ChannelKind } from "@/lib/types";

export type PublishState = "idle" | "connecting" | "live" | "error";

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
 * the SFU coordinates so listeners can subscribe. */
export function usePublisher(sessionId: string | null, secret: string | null) {
  const [state, setState] = useState<PublishState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const handleRef = useRef<PublishHandle | null>(null);
  const channelIdRef = useRef<string | null>(null);

  const stop = useCallback(async () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setStream(null);
    setState("idle");
    const cid = channelIdRef.current;
    if (sessionId && secret && cid) {
      // Mark the channel offline (best-effort).
      fetch(`/api/sessions/${sessionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          channelId: cid,
          sfuSessionId: "x",
          trackName: "x",
          live: false,
        }),
      }).catch(() => {});
    }
  }, [sessionId, secret]);

  const go = useCallback(
    async (spec: ChannelSpec, opts: PublishOpts) => {
      if (!sessionId || !secret) return;
      setState("connecting");
      setError("");
      try {
        // 1. Ensure the channel exists.
        const ch = await fetch(`/api/sessions/${sessionId}/channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            kind: spec.kind,
            targetLocale: spec.targetLocale,
            label: spec.label,
          }),
        }).then((r) => r.json());
        const channelId: string = ch?.channel?.id;
        if (!channelId) throw new Error("channel");
        channelIdRef.current = channelId;

        // 2. Capture audio.
        const audio: MediaTrackConstraints =
          opts.mode === "music"
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (opts.deviceId) audio.deviceId = { exact: opts.deviceId };
        const mic = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        setStream(mic);

        // 3. Publish to the SFU.
        const trackName = `${spec.kind}-${spec.targetLocale ?? "orig"}`;
        const handle = await publishTrack(mic, trackName, sessionId);
        handleRef.current = handle;
        handle.onState((s) => {
          if (s === "connected") setState("live");
          else if (s === "failed" || s === "disconnected" || s === "closed") setState("error");
        });

        // 4. Register coordinates so listeners can pull it.
        await fetch(`/api/sessions/${sessionId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            channelId,
            sfuSessionId: handle.sfuSessionId,
            trackName,
            live: true,
          }),
        });
        setState("live");
      } catch (e) {
        setError(e instanceof Error ? e.message : "feil");
        setState("error");
      }
    },
    [sessionId, secret],
  );

  return { state, stream, error, go, stop };
}
