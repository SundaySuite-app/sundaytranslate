"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VuMeter } from "@/components/VuMeter";
import { InlineError } from "@/components/InlineError";
import { useHashSecret, useVuMeter, useWakeLock } from "@/lib/client/hooks";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { usePublisher } from "@/lib/client/usePublisher";
import { LANGS, langName } from "@/lib/locales";

/** Human-friendly Norwegian text for the publisher's error codes. */
function errorText(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Lenken er ikke gyldig lenger. Be operatøren om en ny tolk-QR.";
    case "mic_lost":
      return "Mikrofonen forsvant (frakoblet eller tatt av en annen app). Sjekk den og start på nytt.";
    case "connection_lost":
      return "Mistet forbindelsen og fikk ikke koblet til igjen. Sjekk nettet og start på nytt.";
    default:
      return "Tilkobling feilet. Sjekk mikrofon og nett, og prøv igjen.";
  }
}

export default function Interpreter() {
  const pin = String(useParams().pin);
  const secret = useHashSecret();
  const { loading, id, session, error } = useStaffSession(pin);
  const pub = usePublisher(id, secret, session?.localRelayUrl ?? null);
  const level = useVuMeter(pub.stream);
  const [lang, setLang] = useState("");
  const [muted, setMuted] = useState(false);

  // Remember the language across a mid-service page reload.
  useEffect(() => {
    const saved = localStorage.getItem("st-tolk-lang");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only restore after hydration
    if (saved) setLang(saved);
  }, []);
  function changeLang(code: string) {
    setLang(code);
    localStorage.setItem("st-tolk-lang", code);
  }

  const live = pub.state === "live" || pub.state === "reconnecting";
  // The interpreter's phone must not lock mid-service — that kills the mic.
  useWakeLock(live || pub.state === "connecting");

  // Cough button: mute pauses the outgoing track without dropping listeners.
  useEffect(() => {
    pub.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [pub.stream, muted]);

  if (loading) return <Center>Laster…</Center>;
  if (error || !id) return <Center>Fant ingen aktiv sesjon for PIN {pin}.</Center>;
  if (!secret) return <Center>Denne siden må åpnes via operatørens tolk-QR.</Center>;

  function start() {
    if (!lang) return;
    setMuted(false);
    pub.go(
      { kind: "human", targetLocale: lang, label: langName(lang) },
      { mode: "voice" },
    );
  }

  function stopPublishing() {
    setMuted(false);
    pub.stop();
  }

  return (
    <main className="center-screen" aria-labelledby="tolk-title">
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="card stack" role="region" aria-label="Tolk-konsoll">
          <div className="kicker">
            <span aria-hidden="true">🎙️ </span>Tolk
          </div>
          <h1 id="tolk-title" style={{ fontSize: 24 }}>{session?.title || "Tolking"}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Bruk hodetelefoner og les oversettelsen høyt. Lytterne som velger ditt
            språk hører deg direkte.
          </p>

          {/* Live status, announced to screen readers as it changes. */}
          <p role="status" aria-live="polite" className="visually-hidden">
            {pub.state === "connecting"
              ? "Kobler til…"
              : pub.state === "reconnecting"
                ? "Mistet forbindelsen — kobler til igjen…"
                : live
                  ? muted
                    ? "Mikrofonen er dempet."
                    : `Du sender nå tolking på ${langName(lang)}.`
                  : pub.state === "error"
                    ? "Tilkobling feilet."
                    : "Klar til å starte tolking."}
          </p>

          {!live ? (
            <>
              <div className="field">
                <label className="label" htmlFor="lang">
                  Jeg tolker til
                </label>
                <select
                  id="lang"
                  className="select"
                  value={lang}
                  onChange={(e) => changeLang(e.target.value)}
                  aria-label="Velg språk du tolker til"
                >
                  <option value="">Velg språk…</option>
                  {LANGS.filter((l) => l.code !== session?.sourceLocale).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={start}
                disabled={!lang || pub.state === "connecting"}
                aria-busy={pub.state === "connecting"}
              >
                {pub.state === "connecting" ? "Kobler til…" : "Start tolking"}
              </button>
            </>
          ) : (
            <>
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div className="kicker">
                  <span className="live-dot" aria-hidden="true" />{" "}
                  {pub.state === "reconnecting" ? "Kobler til igjen…" : "Du sender på"}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {langName(lang)}
                </div>
              </div>
              {pub.stream && <VuMeter level={muted ? 0 : level} label="Ditt mikrofonnivå" />}
              <button
                className="btn btn-block"
                onClick={() => setMuted((m) => !m)}
                aria-pressed={muted}
              >
                {muted ? "🔇 Dempet — trykk for å fortsette" : "🎤 Demp (host/pause)"}
              </button>
              <button className="btn btn-block" onClick={stopPublishing}>
                Stopp tolking
              </button>
            </>
          )}
          {pub.state === "reconnecting" && (
            <InlineError>
              Mistet forbindelsen — prøver å koble til igjen automatisk. Lytterne
              får lyden tilbake så snart det lykkes.
            </InlineError>
          )}
          {pub.state === "error" && <InlineError>{errorText(pub.error)}</InlineError>}
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
