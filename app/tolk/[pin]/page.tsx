"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { VuMeter } from "@/components/VuMeter";
import { useHashSecret, useVuMeter } from "@/lib/client/hooks";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { usePublisher } from "@/lib/client/usePublisher";
import { LANGS, langName } from "@/lib/locales";

export default function Interpreter() {
  const pin = String(useParams().pin);
  const secret = useHashSecret();
  const { loading, id, session, error } = useStaffSession(pin);
  const pub = usePublisher(id, secret);
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
    <main className="center-screen">
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="card stack">
          <div className="kicker">🎙️ Tolk</div>
          <h1 style={{ fontSize: 24 }}>{session?.title || "Tolking"}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Bruk hodetelefoner og les oversettelsen høyt. Lytterne som velger ditt
            språk hører deg direkte.
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
              >
                {pub.state === "connecting" ? "Kobler til…" : "Start tolking"}
              </button>
            </>
          ) : (
            <>
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div className="kicker">
                  <span className="live-dot" /> Du sender på
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {langName(lang)}
                </div>
              </div>
              {pub.stream && <VuMeter level={level} />}
              <button className="btn btn-block" onClick={pub.stop}>
                Stopp tolking
              </button>
            </>
          )}
          {pub.state === "error" && (
            <p style={{ color: "var(--danger)", margin: 0 }}>
              Tilkobling feilet. Sjekk mikrofon og nett, og prøv igjen.
            </p>
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
