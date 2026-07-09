"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Qr } from "@/components/Qr";
import { InlineError } from "@/components/InlineError";
import { useHashSecret } from "@/lib/client/hooks";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { usePresenceCount } from "@/lib/client/usePresence";
import { channels as rtChannels } from "@/lib/realtime";
import { LANGS, langName } from "@/lib/locales";

export default function Operator() {
  const id = String(useParams().id);
  const pin = useSearchParams().get("pin") ?? "";
  const secret = useHashSecret();
  const { channels, status } = useLiveChannels(id);

  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [channelError, setChannelError] = useState("");
  // The staff QRs carry the write secret — keep them hidden until deliberately
  // revealed, since this page often IS the projected big screen.
  const [showStaff, setShowStaff] = useState(false);
  const [copied, setCopied] = useState("");
  const listeners = usePresenceCount(rtChannels.presence(id));

  async function copyLink(which: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard unavailable — the QR still works */
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const listenUrl = `${origin}/${pin}`;
  const sourceUrl = `${origin}/kilde/${pin}#${secret ?? ""}`;
  const interpUrl = `${origin}/tolk/${pin}#${secret ?? ""}`;

  const taken = useMemo(
    () => new Set(channels.filter((c) => c.kind === "human").map((c) => c.targetLocale)),
    [channels],
  );

  async function addLanguage() {
    if (!adding || !secret) return;
    setBusy(true);
    setChannelError("");
    try {
      const res = await fetch(`/api/sessions/${id}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ kind: "human", targetLocale: adding, label: langName(adding) }),
      });
      if (!res.ok) throw new Error(`add ${res.status}`);
      setAdding("");
    } catch {
      setChannelError("Fikk ikke lagt til språket. Sjekk nettet og prøv igjen.");
    } finally {
      setBusy(false);
    }
  }

  async function removeChannel(channelId: string, name: string) {
    if (!secret || !confirm(`Fjerne kanalen ${name}?`)) return;
    setChannelError("");
    try {
      const res = await fetch(`/api/sessions/${id}/channels`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error(`delete ${res.status}`);
    } catch {
      setChannelError("Fikk ikke fjernet kanalen. Sjekk nettet og prøv igjen.");
    }
  }

  async function end() {
    if (!secret || !confirm("Avslutte sesjonen for alle?")) return;
    try {
      const res = await fetch(`/api/sessions/${id}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) throw new Error(`end ${res.status}`);
    } catch {
      setChannelError("Fikk ikke avsluttet sesjonen. Sjekk nettet og prøv igjen.");
    }
  }

  if (status === "ended") {
    return (
      <main className="center-screen">
        <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
          <h2>Sesjonen er avsluttet</h2>
          <p className="muted">Takk! Du kan starte en ny sesjon fra forsiden.</p>
          <Link className="btn btn-primary btn-block" href="/" style={{ marginTop: 16 }}>
            Til forsiden
          </Link>
        </div>
      </main>
    );
  }

  if (!secret) {
    return (
      <main className="center-screen">
        <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
          <h2>Mangler operatør-nøkkel</h2>
          <p className="muted">
            Denne lenken må åpnes fra «Start sesjon». Start en ny sesjon fra forsiden.
          </p>
          <Link className="btn btn-primary btn-block" href="/" style={{ marginTop: 16 }}>
            Til forsiden
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ padding: "32px 20px 64px", maxWidth: 920 }}>
      <div className="stack" style={{ gap: 28 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="kicker">
              <span className="live-dot" aria-hidden="true" /> Operatør · sesjon aktiv
            </div>
            <h1 style={{ fontSize: 28, marginTop: 6 }}>Oversettelse</h1>
          </div>
          <button className="btn btn-ghost" onClick={end}>
            Avslutt sesjon
          </button>
        </header>

        {/* Listener join — the big screen */}
        <section className="card" style={{ textAlign: "center" }} aria-label="PIN-kode og QR for lyttere">
          <div className="kicker">Lyttere skanner her</div>
          <div className="pin" style={{ margin: "8px 0 16px" }} aria-label={`PIN-kode ${pin.split("").join(" ")}`}>{pin}</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Qr value={listenUrl} size={240} alt="QR-kode lyttere skanner for å bli med" />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            translate.sundaysuite.app → tast inn <strong>{pin}</strong>
          </p>
          <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: 14 }}>
            <span aria-hidden="true">👥 </span>
            {listeners === 1 ? "1 lytter tilkoblet" : `${listeners} lyttere tilkoblet`}
          </p>
        </section>

        {/* Channels */}
        <section className="card stack" aria-label="Kanaler">
          <div className="kicker">Kanaler</div>
          {channels.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Ingen kanaler ennå. Legg til språk under, og koble til lydkortet via
              kilde-lenken.
            </p>
          )}
          {channels.map((c) => (
            <div
              key={c.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--ink-line)" }}
            >
              <span style={{ fontWeight: 600 }}>
                {c.kind === "original"
                  ? "🔊 Original (lytteanlegg)"
                  : c.kind === "ai"
                    ? `🤖 ${langName(c.targetLocale)} (AI)`
                    : `🎙️ ${langName(c.targetLocale)}`}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="muted" style={{ fontSize: 14 }}>
                  {c.isLive ? (
                    <>
                      <span className="live-dot" aria-hidden="true" /> sender
                    </>
                  ) : (
                    "venter på tilkobling"
                  )}
                </span>
                {c.kind !== "original" && !c.isLive && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    onClick={() => removeChannel(c.id, langName(c.targetLocale))}
                    aria-label={`Fjern kanalen ${langName(c.targetLocale)}`}
                  >
                    Fjern
                  </button>
                )}
              </span>
            </div>
          ))}
          {channelError && <InlineError>{channelError}</InlineError>}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <select
              className="select"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              aria-label="Legg til språk"
            >
              <option value="">Legg til språk…</option>
              {LANGS.filter((l) => !taken.has(l.code)).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={addLanguage}
              disabled={!adding || busy}
              aria-busy={busy}
            >
              Legg til
            </button>
          </div>
        </section>

        {/* Staff links — hidden by default so the secret never hits the big screen. */}
        <section className="card stack">
          <div className="kicker">Til medarbeiderne</div>
          {!showStaff ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                QR-kodene til lydteknikeren og tolkene inneholder en hemmelig
                nøkkel og er derfor skjult. Ikke vis dem på storskjermen.
              </p>
              <button className="btn" onClick={() => setShowStaff(true)}>
                Vis medarbeider-QR
              </button>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Del disse med lydteknikeren og tolkene. De inneholder en hemmelig
                nøkkel — ikke vis dem på storskjermen.
              </p>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <Qr value={sourceUrl} size={150} alt="QR-kode for lydkort / kilde-konsoll" />
                  <div style={{ fontWeight: 700, marginTop: 8 }}>
                    <span aria-hidden="true">🎚️ </span>Lydkort / kilde
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 6, padding: "4px 10px", fontSize: 13 }}
                    onClick={() => copyLink("kilde", sourceUrl)}
                  >
                    {copied === "kilde" ? "Kopiert!" : "Kopier lenke"}
                  </button>
                </div>
                <div style={{ textAlign: "center" }}>
                  <Qr value={interpUrl} size={150} alt="QR-kode for tolk-konsoll" />
                  <div style={{ fontWeight: 700, marginTop: 8 }}>
                    <span aria-hidden="true">🎙️ </span>Tolk
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 6, padding: "4px 10px", fontSize: 13 }}
                    onClick={() => copyLink("tolk", interpUrl)}
                  >
                    {copied === "tolk" ? "Kopiert!" : "Kopier lenke"}
                  </button>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => setShowStaff(false)}>
                Skjul QR-kodene
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
