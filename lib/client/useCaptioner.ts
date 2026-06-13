"use client";

import { useEffect } from "react";

interface CaptionerOpts {
  sessionId: string | null;
  secret: string | null;
  stream: MediaStream | null;
  source: string;
  targets: string[];
  enabled: boolean;
}

/** Source-side caption feeder: while enabled, record the publishing stream in
 * short self-contained chunks and POST each to /asr. Server transcribes +
 * translates + broadcasts. Best-effort; failures are swallowed so captions can
 * never disturb the live audio. */
export function useCaptioner({ sessionId, secret, stream, source, targets, enabled }: CaptionerOpts) {
  const targetsKey = targets.join(",");
  useEffect(() => {
    if (!enabled || !stream || !sessionId || !secret) return;
    if (typeof MediaRecorder === "undefined") return;

    let stopped = false;
    let rec: MediaRecorder | null = null;

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    const cycle = () => {
      if (stopped) return;
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec?.mimeType || "audio/webm" });
        if (blob.size > 1200 && !stopped) {
          const qs = new URLSearchParams({ source, targets: targetsKey });
          fetch(`/api/sessions/${sessionId}/asr?${qs.toString()}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}` },
            body: blob,
          }).catch(() => {});
        }
        if (!stopped) cycle();
      };
      rec.start();
      // ~5s windows: long enough for a phrase, short enough to feel live.
      setTimeout(() => {
        if (rec && rec.state !== "inactive") rec.stop();
      }, 5000);
    };
    cycle();

    return () => {
      stopped = true;
      if (rec && rec.state !== "inactive") rec.stop();
      rec = null;
    };
  }, [enabled, stream, sessionId, secret, source, targetsKey]);
}
