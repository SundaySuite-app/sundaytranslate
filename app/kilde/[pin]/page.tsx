"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { VuMeter } from "@/components/VuMeter";
import { useHashSecret, useVuMeter, useAudioInputs } from "@/lib/client/hooks";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { usePublisher } from "@/lib/client/usePublisher";

export default function Source() {
  const pin = String(useParams().pin);
  const secret = useHashSecret();
  const { loading, id, session, error } = useStaffSession(pin);
  const pub = usePublisher(id, secret);
  const level = useVuMeter(pub.stream);

  const [granted, setGranted] = useState(false);
  const [device, setDevice] = useState("");
  const devices = useAudioInputs(granted);

  async function grant() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setGranted(true);
    } catch {
      /* denied */
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

  const live = pub.state === "live";

  return (
    <main className="center-screen">
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="card stack">
          <div className="kicker">🎚️ Lydkort · kilde</div>
          <h1 style={{ fontSize: 24 }}>{session?.title || "Original-lyd"}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Sender menighetens lyd til lytternes telefoner — oversettelse og
            lytteanlegg for hørselshemmede.
          </p>

          {!granted ? (
            <button className="btn btn-primary btn-lg btn-block" onClick={grant}>
              Gi tilgang til lyd
            </button>
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
                >
                  <option value="">Standard inngang</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Lydinngang"}
                    </option>
                  ))}
                </select>
              </div>

              {pub.stream && <VuMeter level={level} />}

              {!live ? (
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={start}
                  disabled={pub.state === "connecting"}
                >
                  {pub.state === "connecting" ? "Kobler til…" : "Start sending"}
                </button>
              ) : (
                <button className="btn btn-block" onClick={pub.stop}>
                  Stopp sending
                </button>
              )}

              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                {live ? (
                  <>
                    <span className="live-dot" /> Sender original-lyd
                  </>
                ) : (
                  "Velg lydkortet fra mikseren og trykk start."
                )}
              </p>
              {pub.state === "error" && (
                <p style={{ color: "var(--danger)", margin: 0 }}>
                  Tilkobling feilet. Sjekk lydkilde og nett, og prøv igjen.
                </p>
              )}
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
