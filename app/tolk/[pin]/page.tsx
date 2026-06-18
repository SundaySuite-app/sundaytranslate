"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { VuMeter } from "@/components/VuMeter";
import { InlineError } from "@/components/InlineError";
import { useHashSecret, useVuMeter } from "@/lib/client/hooks";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { usePublisher } from "@/lib/client/usePublisher";
import { LANGS, langName } from "@/lib/locales";

export default function Interpreter() {
  const pin = String(useParams().pin);
  const secret = useHashSecret();
  const { loading, id, session, error } = useStaffSession(pin);
  const pub = usePublisher(id, secret, session?.localRelayUrl ?? null);
  const level = useVuMeter(pub.stream);
  const [lang, setLang] = useState("");

  if (loading) return <Center>Laster…</Center>;
  if (error || !id) return <Center>Fant ingen aktiv sesjon for PIN {pin}.</Center>;
  if (!secret) return <Center>Denne siden må åpnes via operatørens tolk-QR.</Center>;

  const live = pub.state === "live";

  function start() {
    if (!lang) return;
    pub.go(
      { kind: "human", targetLocale: lang, label: langName(lang) },
      { mode: "voice" },
    );
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
              : live
                ? `Du sender nå tolking på ${langName(lang)}.`
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
                  onChange={(e) => setLang(e.target.value)}
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
                  <span className="live-dot" aria-hidden="true" /> Du sender på
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {langName(lang)}
                </div>
              </div>
              {pub.stream && <VuMeter level={level} label="Ditt mikrofonnivå" />}
              <button className="btn btn-block" onClick={pub.stop}>
                Stopp tolking
              </button>
            </>
          )}
          {pub.state === "error" && (
            <InlineError>
              Tilkobling feilet. Sjekk mikrofon og nett, og prøv igjen.
            </InlineError>
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
