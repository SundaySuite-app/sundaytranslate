"use client";

import { useCallback, useEffect, useRef } from "react";

/** A tiny silent WAV — played inside the user's toggle gesture to unlock the
 * Audio element on iOS (autoplay policy), so later async TTS play() succeeds. */
const SILENCE =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

/** Phase 3 — client-side AI voice. When enabled, each new caption line is sent
 * to /api/tts and the returned audio is played in sequence. No server-side
 * WebRTC: the listener's own device speaks the translation. Best-effort and
 * experimental (latency + per-line chunking; limited language coverage).
 * Call `prime()` inside the enable-toggle's gesture to unlock iOS autoplay. */
export function useTtsVoice(
  text: string,
  locale: string,
  enabled: boolean,
  sessionId: string | null,
): { prime: () => void } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const lastRef = useRef("");

  // Must run synchronously inside the user's tap on the AI-voice toggle: iOS
  // only unlocks an Audio element that has played within a gesture.
  const prime = useCallback(() => {
    const el = audioRef.current;
    if (!el || playingRef.current) return;
    el.src = SILENCE;
    el.play().catch(() => {});
  }, []);

  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const el = audioRef.current;
    if (!el) return;
    // Walk the queue until a line starts playing — a refused play (autoplay
    // policy) or bad blob is dropped instead of stalling the voice until the
    // next caption arrives.
    const tryPlay = () => {
      const url = queueRef.current.shift();
      if (!url) return;
      playingRef.current = true;
      el.src = url;
      el.play().catch(() => {
        playingRef.current = false;
        URL.revokeObjectURL(url);
        tryPlay();
      });
    };
    tryPlay();
  }, []);

  // One reusable audio element; advance the queue on each end — and on each
  // ERROR, otherwise one undecodable blob stalls the voice forever.
  useEffect(() => {
    const el = new Audio();
    const advance = () => {
      if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
      playingRef.current = false;
      playNext();
    };
    el.onended = advance;
    el.onerror = advance;
    audioRef.current = el;
    const queue = queueRef;
    return () => {
      el.pause();
      if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
      queue.current.forEach((u) => URL.revokeObjectURL(u));
      queue.current = [];
      audioRef.current = null;
    };
  }, [playNext]);

  // Language switch: flush queued audio in the OLD language and forget the
  // last spoken line, so the new language starts clean.
  useEffect(() => {
    const queue = queueRef;
    const last = lastRef;
    return () => {
      queue.current.forEach((u) => URL.revokeObjectURL(u));
      queue.current = [];
      last.current = "";
    };
  }, [locale]);

  // Flush queue when toggled off.
  useEffect(() => {
    if (enabled) return;
    queueRef.current.forEach((u) => URL.revokeObjectURL(u));
    queueRef.current = [];
    audioRef.current?.pause();
    playingRef.current = false;
  }, [enabled]);

  // Synthesize each fresh line.
  useEffect(() => {
    const line = text.trim();
    if (!enabled || !line || !sessionId || line === lastRef.current) return;
    lastRef.current = line;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": sessionId },
          body: JSON.stringify({ text: line, locale }),
        });
        if (!res.ok || !alive) return;
        const blob = await res.blob();
        if (!alive) return;
        queueRef.current.push(URL.createObjectURL(blob));
        // TTS is slower than the caption cadence; without a cap the queue grows
        // without bound and the voice drifts ever further behind the room.
        // Keep only the freshest few lines — skip-to-latest beats minutes-late.
        while (queueRef.current.length > 3) {
          const dropped = queueRef.current.shift();
          if (dropped) URL.revokeObjectURL(dropped);
        }
        playNext();
      } catch {
        /* ignore — captions still show */
      }
    })();
    return () => {
      alive = false;
    };
  }, [text, locale, enabled, sessionId, playNext]);

  return { prime };
}
