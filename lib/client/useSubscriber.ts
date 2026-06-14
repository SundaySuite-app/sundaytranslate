"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeTrack,
  subscribeTrackWhep,
  relayReachable,
  whepUrl,
  type MediaHandle,
} from "@/lib/sfu";
import type { ChannelView } from "@/lib/types";

export type ListenState = "idle" | "connecting" | "playing" | "error";
/** Which path the active audio is flowing over (for the UI indicator). */
export type ListenTransport = "local" | "cloud" | null;

/** Listener-side audio subscription. One active channel at a time. iOS-safe:
 * the play() is primed inside the user's tap, then re-issued when the inbound
 * track arrives; a single reused AudioContext resume unlocks audio on Safari.
 *
 * Prefers the church's LOCAL relay (WHEP, on-wifi) when it hosts the channel
 * and is reachable, and falls back to the CLOUD SFU otherwise (4G / no relay /
 * relay failure). `localRelayUrl` is null when no relay hosts the session →
 * behaviour is exactly the cloud path. The cloud path is gated on a live
 * `sessionId` (the `/api/rt` proxy's auth header); the local relay path talks
 * straight to mediamtx on the LAN and needs no session id. */
export function useSubscriber(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  sessionId: string | null,
  localRelayUrl: string | null,
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<ListenState>("idle");
  const [transport, setTransport] = useState<ListenTransport>(null);
  const handleRef = useRef<MediaHandle | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setActiveId(null);
    setState("idle");
    setTransport(null);
    if (audioRef.current) audioRef.current.srcObject = null;
  }, [audioRef]);

  // Tear down the peer connection + audio context when the listener unmounts
  // (session ended, navigated away) — otherwise the PC keeps pulling audio.
  useEffect(() => {
    const ctx = ctxRef;
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
      ctx.current?.close().catch(() => {});
      ctx.current = null;
    };
  }, []);

  const listen = useCallback(
    async (channel: ChannelView) => {
      // Prime playback inside the gesture tick (iOS autoplay unlock). Reuse a
      // single AudioContext — creating one per tap leaks them (iOS caps ~6).
      const el = audioRef.current;
      try {
        if (!ctxRef.current) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ctxRef.current = new AC();
        }
        if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      } catch {
        /* ignore */
      }
      el?.play().catch(() => {});

      handleRef.current?.stop();
      handleRef.current = null;
      setActiveId(channel.id);
      setState("connecting");

      const onStream = (stream: MediaStream) => {
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
      };
      const wire = (handle: MediaHandle, t: ListenTransport) => {
        handleRef.current = handle;
        setTransport(t);
        handle.onState((s) => {
          if (s === "connected") setState("playing");
          else if (s === "failed" || s === "disconnected" || s === "closed") setState("error");
        });
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: channel.label || "SundayTranslate",
            artist: "SundayTranslate",
          });
        }
      };

      // 1. Prefer the local relay when it hosts this channel and is reachable.
      if (localRelayUrl && channel.localStream && channel.localIsLive) {
        if (await relayReachable(localRelayUrl)) {
          try {
            const handle = await subscribeTrackWhep(
              whepUrl(localRelayUrl, channel.localStream),
              onStream,
            );
            wire(handle, "local");
            return;
          } catch {
            /* local failed — fall through to the cloud */
          }
        }
      }

      // 2. Cloud fallback (the path used today). Needs a live session id for the
      //    /api/rt proxy's auth gate.
      if (!channel.sfuSessionId || !channel.trackName || !sessionId) {
        setState("error");
        return;
      }
      try {
        const handle = await subscribeTrack(
          channel.sfuSessionId,
          channel.trackName,
          onStream,
          sessionId,
        );
        wire(handle, "cloud");
      } catch {
        setState("error");
      }
    },
    [audioRef, sessionId, localRelayUrl],
  );

  return { activeId, state, transport, listen, stop };
}
