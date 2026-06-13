"use client";

import { useCallback, useRef, useState } from "react";
import { subscribeTrack, type SubscribeHandle } from "@/lib/sfu";
import type { ChannelView } from "@/lib/types";

export type ListenState = "idle" | "connecting" | "playing" | "error";

/** Listener-side audio subscription. One active channel at a time. iOS-safe:
 * the play() is primed inside the user's tap, then re-issued when the inbound
 * track arrives; an AudioContext resume unlocks audio on Safari. */
export function useSubscriber(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<ListenState>("idle");
  const handleRef = useRef<SubscribeHandle | null>(null);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setActiveId(null);
    setState("idle");
    if (audioRef.current) audioRef.current.srcObject = null;
  }, [audioRef]);

  const listen = useCallback(
    async (channel: ChannelView) => {
      // Prime playback inside the gesture tick (iOS autoplay unlock).
      const el = audioRef.current;
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume();
      } catch {
        /* ignore */
      }
      el?.play().catch(() => {});

      handleRef.current?.stop();
      handleRef.current = null;

      if (!channel.sfuSessionId || !channel.trackName) {
        setState("error");
        return;
      }
      setActiveId(channel.id);
      setState("connecting");

      try {
        const handle = await subscribeTrack(channel.sfuSessionId, channel.trackName, (stream) => {
          if (el) {
            el.srcObject = stream;
            el.play().catch(() => {});
          }
        });
        handleRef.current = handle;
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
      } catch {
        setState("error");
      }
    },
    [audioRef],
  );

  return { activeId, state, listen, stop };
}
