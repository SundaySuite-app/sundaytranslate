"use client";

import { useEffect, useRef, useState } from "react";

interface CaptionerOpts {
  sessionId: string | null;
  secret: string | null;
  stream: MediaStream | null;
  source: string;
  targets: string[];
  enabled: boolean;
}

interface Captioner {
  /** True after several consecutive ASR failures — the sound tech should see
   * that the checkbox is on but captions aren't actually being produced. */
  failing: boolean;
}

/** Consecutive failed chunks before we surface "captions aren't working". */
const FAIL_THRESHOLD = 3;

/** Source-side caption feeder: while enabled, record the publishing stream in
 * short self-contained chunks and POST each to /asr. Server transcribes +
 * translates + broadcasts. Best-effort; failures are swallowed so captions can
 * never disturb the live audio — but repeated failures are surfaced via
 * `failing` so they're not invisible. */
export function useCaptioner({ sessionId, secret, stream, source, targets, enabled }: CaptionerOpts): Captioner {
  const [failing, setFailing] = useState(false);
  const failsRef = useRef(0);
  // Targets live in a ref: the operator adding a language mid-service must not
  // tear down and restart the recorder (that drops the in-flight chunk).
  const targetsRef = useRef(targets);
  useEffect(() => {
    targetsRef.current = targets;
  });

  useEffect(() => {
    if (!enabled || !stream || !sessionId || !secret) return;
    if (typeof MediaRecorder === "undefined") return;

    let stopped = false;
    let rec: MediaRecorder | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    failsRef.current = 0;

    const report = (bad: boolean) => {
      if (stopped) return;
      if (bad) {
        failsRef.current++;
        if (failsRef.current >= FAIL_THRESHOLD) setFailing(true);
      } else {
        failsRef.current = 0;
        setFailing(false);
      }
    };

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    const cycle = () => {
      if (stopped) return;
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        // Recorder construction failed — try again shortly rather than dying
        // silently with the checkbox still ticked.
        report(true);
        retryTimer = setTimeout(cycle, 5000);
        return;
      }
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec?.mimeType || "audio/webm" });
        if (blob.size > 1200 && !stopped) {
          const qs = new URLSearchParams({ source, targets: targetsRef.current.join(",") });
          fetch(`/api/sessions/${sessionId}/asr?${qs.toString()}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}` },
            body: blob,
          })
            .then(async (res) => {
              if (!res.ok) return report(true);
              const d = (await res.json().catch(() => null)) as { reason?: string } | null;
              // "no_asr" = the AI pipeline is absent/broken; "too_short" and a
              // normal transcript both mean the pipe works.
              report(d?.reason === "no_asr");
            })
            .catch(() => report(true));
        }
        if (!stopped) cycle();
      };
      // A MediaRecorder error still fires onstop (which restarts the loop),
      // but count it so a persistent failure becomes visible.
      rec.onerror = () => report(true);
      rec.start();
      // ~5s windows: long enough for a phrase, short enough to feel live.
      setTimeout(() => {
        if (rec && rec.state !== "inactive") rec.stop();
      }, 5000);
    };
    cycle();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (rec && rec.state !== "inactive") rec.stop();
      rec = null;
    };
  }, [enabled, stream, sessionId, secret, source]);

  return { failing };
}
