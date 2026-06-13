"use client";

import { useEffect, useRef, useState } from "react";
import { useChannel } from "@/lib/client/useChannel";
import { channels as rtChannels, events } from "@/lib/realtime";

interface Captions {
  /** Current subtitle line in the chosen language. */
  text: string;
  /** Whether this session is producing captions at all (any language seen). */
  active: boolean;
}

/** Listener-side live subtitle in one language. Subscribes to caption
 * broadcasts (newer-seq wins) and seeds from the late-join snapshot. Works with
 * or without an audio channel selected — deaf/HoH listeners can read along.
 * `active` lets the UI hide the subtitle panel until captions are actually on. */
export function useCaptions(sessionId: string | null, locale: string): Captions {
  const [text, setText] = useState("");
  const [active, setActive] = useState(false);
  const seqRef = useRef(0);

  // Reset the line when the caption language changes (but keep `active`).
  useEffect(() => {
    seqRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the line when the caption language changes
    setText("");
  }, [locale]);

  useChannel(sessionId ? rtChannels.session(sessionId) : null, (event, payload) => {
    if (event !== events.caption) return;
    setActive(true);
    if (payload.locale !== locale) return;
    const seq = Number(payload.seq) || 0;
    if (seq <= seqRef.current) return;
    seqRef.current = seq;
    setText(String(payload.text ?? ""));
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
          setText(c.text);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId, locale]);

  return { text, active };
}
