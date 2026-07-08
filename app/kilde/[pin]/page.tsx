"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { VuMeter } from "@/components/VuMeter";
import { InlineError } from "@/components/InlineError";
import { useHashSecret, useVuMeter, useAudioInputs, useWakeLock } from "@/lib/client/hooks";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { usePublisher } from "@/lib/client/usePublisher";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { useCaptioner } from "@/lib/client/useCaptioner";

/** Human-friendly Norwegian text for the publisher's error codes. */
function errorText(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Lenken er ikke gyldig lenger. Be operatøren om en ny kilde-QR.";
    case "mic_lost":
      return "Lydkilden forsvant (lydkort frakoblet?). Sjekk den og start på nytt.";
    case "connection_lost":
      return "Mistet forbindelsen og fikk ikke koblet til igjen. Sjekk nettet og start på nytt.";
    default:
      return "Tilkobling feilet. Sjekk lydkilde og nett, og prøv igjen.";
  }
}

export default function Source() {
  const pin = String(useParams().pin);
  const secret = useHashSecret();
  const { loading, id, session, error } = useStaffSession(pin);
  const pub = usePublisher(id, secret, session?.localRelayUrl ?? null);
  const level = useVuMeter(pub.stream);

  const [granted, setGranted] = useState(false);
  const [grantError, setGrantError] = useState(false);
  const [device, setDevice] = useState("");
  const devices = useAudioInputs(granted);

  // Phase 2 captions: feed the published stream to ASR for every language the
  // operator added (interpreter optional). Dedupe — a human and an AI channel
  // for the same language must not double the translate cost per chunk.
  const { channels } = useLiveChannels(id);
  const [captions, setCaptions] = useState(false);
  const targets = Array.from(
    new Set(
      channels
        .filter((c) => c.kind !== "original" && c.targetLocale)
        .map((c) => c.targetLocale as string),
    ),
  );
  useCaptioner({
    sessionId: id,
    secret,
    stream: pub.stream,
    source: session?.sourceLocale ?? "no",
    targets,
    enabled: captions && pub.state === "live",
  });

  const live = pub.state === "live" || pub.state === "reconnecting";
  // The source device must not lock mid-service — that kills the feed.
  useWakeLock(live || pub.state === "connecting");

  async function grant() {
    setGrantError(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setGranted(true);
    } catch {
      setGrantError(true);
    }
  }

  function start() {
    pub.go(
      { kind: "original", targetLocale: null, label: "Original" },
      { deviceId: device || undefined, mode: "music" },
    );
  }

  if (loading) return <Center>Laster…</Center>;
  if (error || !id) return <Center>Fant ingen aktiv sesjon for PIN {pin}.</Center>;
  if (!secret) return <Center>Denne siden må åpnes via operatørens kilde-QR.</Center>;

  return (
    <main className="center-screen" aria-labelledby="kilde-title">
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="card stack" role="region" aria-label="Kilde-konsoll for lydkort">
          <div className="kicker">
            <span aria-hidden="true">🎚️ </span>Lydkort · kilde
          </div>
          <h1 id="kilde-title" style={{ fontSize: 24 }}>{session?.title || "Original-lyd"}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Sender menighetens lyd til lytternes telefoner — oversettelse og
            lytteanlegg for hørselshemmede.
          </p>

          {/* Live status, announced to screen readers as it changes. */}
          <p role="status" aria-live="polite" className="visually-hidden">
            {pub.state === "connecting"
              ? "Kobler til…"
              : pub.state === "reconnecting"
                ? "Mistet forbindelsen — kobler til igjen…"
                : live
                  ? "Sender original-lyd nå."
                  : pub.state === "error"
                    ? "Tilkobling feilet."
                    : granted
                      ? "Klar til å starte sending."
                      : "Mangler tilgang til lyd."}
          </p>

          {!granted ? (
            <>
              <button className="btn btn-primary btn-lg btn-block" onClick={grant}>
                Gi tilgang til lyd
              </button>
              {grantError && (
                <InlineError>
                  Fikk ikke tilgang til lyd. Tillat mikrofon/lydinngang for denne
                  siden i nettleserens innstillinger og prøv igjen.
                </InlineError>
              )}
            </>
          ) : (
            <>
              <div className="field">
                <label className="label" htmlFor="dev">
                  Lydkilde
                </label>
                <select
                  id="dev"
                  className="select"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  disabled={live}
                  aria-label="Velg lydinngang"
                >
                  <option value="">Standard inngang</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Lydinngang"}
                    </option>
                  ))}
                </select>
              </div>

              {pub.stream && <VuMeter level={level} label="Inngangsnivå" />}

              {!live ? (
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={start}
                  disabled={pub.state === "connecting"}
                  aria-busy={pub.state === "connecting"}
                >
                  {pub.state === "connecting" ? "Kobler til…" : "Start sending"}
                </button>
              ) : (
                <button className="btn btn-block" onClick={pub.stop}>
                  Stopp sending
                </button>
              )}

              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                {pub.state === "reconnecting" ? (
                  <>
                    <span className="live-dot" aria-hidden="true" /> Kobler til igjen…
                  </>
                ) : live ? (
                  <>
                    <span className="live-dot" aria-hidden="true" /> Sender original-lyd
                  </>
                ) : (
                  "Velg lydkortet fra mikseren og trykk start."
                )}
              </p>
              {live && (
                <label
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={captions}
                    onChange={(e) => setCaptions(e.target.checked)}
                    style={{ width: 20, height: 20 }}
                  />
                  <span>
                    AI-undertekster{" "}
                    <span className="muted" style={{ fontSize: 13 }}>
                      {targets.length
                        ? `(${targets.length} språk + original)`
                        : "(legg til språk hos operatøren)"}
                    </span>
                  </span>
                </label>
              )}
              {pub.state === "reconnecting" && (
                <InlineError>
                  Mistet forbindelsen — prøver å koble til igjen automatisk.
                </InlineError>
              )}
              {pub.state === "error" && <InlineError>{errorText(pub.error)}</InlineError>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="center-screen">
      <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
        {children}
      </div>
    </main>
  );
}
