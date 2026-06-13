"use client";

import { useEffect, useRef, useState } from "react";

/** Read a secret stashed in the URL fragment (#<secret>). Staff links carry the
 * session write-secret in the hash so it never hits the server / a QR for
 * listeners. */
export function useHashSecret(): string | null {
  const [secret, setSecret] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSecret(window.location.hash.replace(/^#/, "") || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return secret;
}

/** Hold a Screen Wake Lock while `on` is true — keeps the phone awake so audio
 * playback isn't suspended mid-service. Best-effort (unsupported → no-op). */
export function useWakeLock(on: boolean): void {
  const ref = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
    };
    async function acquire() {
      if (!on || !nav.wakeLock) return;
      try {
        ref.current = await nav.wakeLock.request("screen");
      } catch {
        /* denied / not visible — ignore */
      }
    }
    async function release() {
      try {
        await ref.current?.release();
      } catch {
        /* ignore */
      }
      ref.current = null;
    }
    if (on) {
      acquire();
      const onVis = () => {
        if (document.visibilityState === "visible" && on && !cancelled) acquire();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVis);
        release();
      };
    }
    release();
  }, [on]);
}

/** Live VU level (0..1) from a MediaStream, so a publisher can SEE that audio is
 * flowing. Pure client-side Web Audio — no network. */
export function useVuMeter(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset level when the stream detaches
      setLevel(0);
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.2));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream]);
  return level;
}

/** List audio input devices (the sound card picker). Requires a prior
 * getUserMedia grant for labels to be populated. */
export function useAudioInputs(ready: boolean): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === "audioinput"));
      } catch {
        /* ignore */
      }
    };
    load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", load);
    };
  }, [ready]);
  return devices;
}
