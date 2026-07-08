"use client";

import { useEffect, useRef, useState } from "react";
import { useChannel } from "@/lib/client/useChannel";
import { channels as rtChannels, events } from "@/lib/realtime";

/** How many caption lines to keep visible (current + a little history, so a
 * line replaced mid-read isn't lost for a slow reader). */
const MAX_LINES = 2;

interface Captions {
  /** Current subtitle line in the chosen language (what TTS speaks). */
  text: string;
  /** The last few lines, oldest first — the current line is the last entry. */
  lines: string[];
  /** Whether this session is producing captions at all (any language seen). */
  active: boolean;
}

/** Listener-side live subtitles in one language. Subscribes to caption
 * broadcasts (newer-seq wins) and seeds from the late-join snapshot. Works with
 * or without an audio channel selected — deaf/HoH listeners can read along.
 * `active` lets the UI hide the subtitle panel until captions are actually on. */
export function useCaptions(sessionId: string | null, locale: string): Captions {
  const [lines, setLines] = useState<string[]>([]);
  const [active, setActive] = useState(false);
  const seqRef = useRef(0);

  // Reset the lines when the caption language changes (but keep `active`).
  useEffect(() => {
    seqRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the lines when the caption language changes
    setLines([]);
  }, [locale]);

  useChannel(sessionId ? rtChannels.session(sessionId) : null, (event, payload) => {
    if (event !== events.caption) return;
    setActive(true);
    if (payload.locale !== locale) return;
    const seq = Number(payload.seq) || 0;
    if (seq <= seqRef.current) return;
    seqRef.current = seq;
    const text = String(payload.text ?? "");
    setLines((prev) => [...prev, text].slice(-MAX_LINES));
  });

  // Late-join: fetch current lines; seed this locale + learn if captions are on.
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    fetch(`/api/sessions/${sessionId}/captions`)
      .then((r) => r.json())
      .then((d: { captions?: Array<{ locale: string; seq: number; text: string }> }) => {
        if (!alive) return;
        if (d.captions && d.captions.length > 0) setActive(true);
        const c = d.captions?.find((x) => x.locale === locale);
        if (c && c.seq > seqRef.current) {
          seqRef.current = c.seq;
          setLines((prev) => [...prev, c.text].slice(-MAX_LINES));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId, locale]);

  return { text: lines[lines.length - 1] ?? "", lines, active };
}
