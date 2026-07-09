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

/** Give a "disconnected" PC this long to self-heal (wifi blip / ICE hiccup)
 * before tearing down and resubscribing. */
const DISCONNECT_GRACE_MS = 4_000;
/** A connect attempt that never reaches "connected" is abandoned after this. */
const CONNECT_TIMEOUT_MS = 12_000;
/** Automatic resubscribe attempts (exponential backoff, capped) before the UI
 * shows the error + manual retry. */
const MAX_RETRIES = 6;

/** Listener-side audio subscription. One active channel at a time. iOS-safe:
 * the play() is primed inside the user's tap, then re-issued when the inbound
 * track arrives; a single reused AudioContext resume unlocks audio on Safari.
 *
 * Self-healing: a dropped connection retries with backoff instead of dying on
 * the first church-wifi blip, and `sync()` (fed from the live channel list)
 * follows publisher restarts — new SFU coordinates → resubscribe; channel
 * offline → park quietly and reconnect when it returns.
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
  // The channel we're (re)subscribing to — kept fresh via sync().
  const channelRef = useRef<ChannelView | null>(null);
  // Generation counter: bumping it invalidates every in-flight connect, state
  // callback and timer from the previous subscription (rapid channel taps,
  // stop-while-connecting, publisher restarts).
  const genRef = useRef(0);
  const attemptRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(gen: number) => void>(() => {});
  // True while the user paused via lock-screen/headset controls — the
  // visibility-resume must not override a deliberate pause.
  const userPausedRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const t of [retryTimer, graceTimer, watchdogTimer]) {
      if (t.current) {
        clearTimeout(t.current);
        t.current = null;
      }
    }
  }, []);

  const teardownHandle = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
  }, []);

  const stop = useCallback(() => {
    genRef.current++;
    clearTimers();
    attemptRef.current = 0;
    channelRef.current = null;
    userPausedRef.current = false;
    teardownHandle();
    setActiveId(null);
    setState("idle");
    setTransport(null);
    if (audioRef.current) audioRef.current.srcObject = null;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  }, [audioRef, clearTimers, teardownHandle]);

  // iOS/Android can suspend the tab (screen lock without wake lock, app
  // switch); when it comes back, kick the paused element — unless the user
  // paused deliberately from the lock screen.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (userPausedRef.current) return;
      const el = audioRef.current;
      if (handleRef.current && el && el.paused) el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [audioRef]);

  // Tear down the peer connection + audio context when the listener unmounts
  // (session ended, navigated away) — otherwise the PC keeps pulling audio.
  useEffect(() => {
    const ctx = ctxRef;
    const gen = genRef;
    return () => {
      gen.current++;
      for (const t of [retryTimer, graceTimer, watchdogTimer]) {
        if (t.current) clearTimeout(t.current);
      }
      handleRef.current?.stop();
      handleRef.current = null;
      ctx.current?.close().catch(() => {});
      ctx.current = null;
    };
  }, []);

  const scheduleRetry = useCallback(
    (gen: number) => {
      if (gen !== genRef.current) return;
      clearTimers();
      teardownHandle();
      const attempt = ++attemptRef.current;
      if (attempt > MAX_RETRIES) {
        setState("error");
        return;
      }
      setState("connecting");
      const delay = Math.min(8_000, 1_000 * 2 ** (attempt - 1));
      retryTimer.current = setTimeout(() => connectRef.current(gen), delay);
    },
    [clearTimers, teardownHandle],
  );

  const connect = useCallback(
    async (gen: number) => {
      const channel = channelRef.current;
      const el = audioRef.current;
      if (gen !== genRef.current || !channel) return;
      teardownHandle();
      setState("connecting");

      const onStream = (stream: MediaStream) => {
        if (gen !== genRef.current) return;
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
      };
      const wire = (handle: MediaHandle, t: ListenTransport) => {
        handleRef.current = handle;
        setTransport(t);
        // Watchdog: ICE can hang without ever reporting "failed".
        if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
        watchdogTimer.current = setTimeout(() => {
          watchdogTimer.current = null;
          if (gen === genRef.current && handle.pc.connectionState !== "connected") {
            scheduleRetry(gen);
          }
        }, CONNECT_TIMEOUT_MS);
        handle.onState((s) => {
          if (gen !== genRef.current) return;
          if (s === "connected") {
            attemptRef.current = 0;
            clearTimers();
            setState("playing");
            el?.play().catch(() => {});
          } else if (s === "failed" || s === "closed") {
            scheduleRetry(gen);
          } else if (s === "disconnected") {
            // Frequently transient — grace period before resubscribing.
            if (graceTimer.current) clearTimeout(graceTimer.current);
            graceTimer.current = setTimeout(() => {
              graceTimer.current = null;
              if (gen === genRef.current && handle.pc.connectionState !== "connected") {
                scheduleRetry(gen);
              }
            }, DISCONNECT_GRACE_MS);
          }
        });
        // ICE can complete before the subscribe HTTP round-trip returns, so the
        // "connected" (or "failed") event may have fired before the listener
        // above attached — catch up on the current state or the UI shows
        // "connecting" forever while audio is already flowing.
        const s0 = handle.pc.connectionState;
        if (s0 === "connected") {
          attemptRef.current = 0;
          clearTimers();
          setState("playing");
          el?.play().catch(() => {});
        } else if (s0 === "failed" || s0 === "closed") {
          scheduleRetry(gen);
        }
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: channel.label || "SundayTranslate",
            artist: "SundayTranslate",
          });
          navigator.mediaSession.playbackState = "playing";
          // Lock-screen/headset controls: honour pause, resume at the live
          // edge on play (it's a live stream — play() rejoins "now").
          try {
            navigator.mediaSession.setActionHandler("play", () => {
              userPausedRef.current = false;
              el?.play().catch(() => {});
              navigator.mediaSession.playbackState = "playing";
            });
            navigator.mediaSession.setActionHandler("pause", () => {
              userPausedRef.current = true;
              el?.pause();
              navigator.mediaSession.playbackState = "paused";
            });
          } catch {
            /* older browsers without action-handler support */
          }
        }
      };

      // 1. Prefer the local relay when it hosts this channel and is reachable.
      if (localRelayUrl && channel.localStream && channel.localIsLive) {
        const reachable = await relayReachable(localRelayUrl);
        if (gen !== genRef.current) return;
        if (reachable) {
          try {
            const handle = await subscribeTrackWhep(
              whepUrl(localRelayUrl, channel.localStream),
              onStream,
            );
            if (gen !== genRef.current) {
              handle.stop();
              return;
            }
            wire(handle, "local");
            return;
          } catch {
            /* local failed — fall through to the cloud */
          }
          if (gen !== genRef.current) return;
        }
      }

      // 2. Cloud fallback (the path used today). Needs a live session id for the
      //    /api/rt proxy's auth gate.
      if (!channel.sfuSessionId || !channel.trackName || !sessionId) {
        // Publisher not (yet) live — stay parked; sync() reconnects us the
        // moment fresh coordinates arrive on the channel list.
        setState("connecting");
        return;
      }
      try {
        const handle = await subscribeTrack(
          channel.sfuSessionId,
          channel.trackName,
          onStream,
          sessionId,
        );
        if (gen !== genRef.current) {
          handle.stop();
          return;
        }
        wire(handle, "cloud");
      } catch {
        scheduleRetry(gen);
      }
    },
    [audioRef, sessionId, localRelayUrl, clearTimers, scheduleRetry, teardownHandle],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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

      const gen = ++genRef.current;
      clearTimers();
      attemptRef.current = 0;
      channelRef.current = channel;
      userPausedRef.current = false;
      teardownHandle();
      setActiveId(channel.id);
      setTransport(null);
      setState("connecting");
      void connect(gen);
    },
    [audioRef, clearTimers, connect, teardownHandle],
  );

  /** Manual retry after the automatic attempts gave up (the UI button). */
  const retry = useCallback(() => {
    const channel = channelRef.current;
    if (channel) void listen(channel);
  }, [listen]);

  /** Feed fresh channel data from the live channel list so the subscription
   * follows the publisher: restart with new SFU coordinates → resubscribe;
   * gone offline → park quietly; back online → reconnect automatically. */
  const sync = useCallback(
    (fresh: ChannelView | null) => {
      const cur = channelRef.current;
      // No active subscription, or the list is momentarily missing the
      // channel (poll race) — nothing to follow.
      if (!cur || !fresh) return;
      const cameOnline = !cur.isLive && fresh.isLive;
      const wentOffline = cur.isLive && !fresh.isLive;
      const coordsChanged =
        fresh.sfuSessionId !== cur.sfuSessionId || fresh.trackName !== cur.trackName;
      channelRef.current = fresh;
      if (wentOffline) {
        // Publisher dropped: release the dead PC and wait for its return.
        genRef.current++;
        clearTimers();
        attemptRef.current = 0;
        teardownHandle();
        setState("connecting");
        return;
      }
      if (fresh.isLive && (cameOnline || coordsChanged)) {
        const gen = ++genRef.current;
        clearTimers();
        attemptRef.current = 0;
        setState("connecting");
        void connect(gen);
      }
    },
    [clearTimers, connect, teardownHandle],
  );

  return { activeId, state, transport, listen, stop, retry, sync };
}
