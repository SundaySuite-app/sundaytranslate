"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Qr } from "@/components/Qr";
import { useHashSecret } from "@/lib/client/hooks";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { LANGS, langName } from "@/lib/locales";

export default function Operator() {
  const id = String(useParams().id);
  const pin = useSearchParams().get("pin") ?? "";
  const secret = useHashSecret();
  const { channels, status } = useLiveChannels(id);

  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

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
    try {
      await fetch(`/api/sessions/${id}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ kind: "human", targetLocale: adding, label: langName(adding) }),
      });
      setAdding("");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!secret || !confirm("Avslutte sesjonen for alle?")) return;
    await fetch(`/api/sessions/${id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
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
              <span className="live-dot" /> Operatør · sesjon aktiv
            </div>
            <h1 style={{ fontSize: 28, marginTop: 6 }}>Oversettelse</h1>
          </div>
          <button className="btn btn-ghost" onClick={end}>
            Avslutt sesjon
          </button>
        </header>

        {/* Listener join — the big screen */}
        <section className="card" style={{ textAlign: "center" }}>
          <div className="kicker">Lyttere skanner her</div>
          <div className="pin" style={{ margin: "8px 0 16px" }}>{pin}</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Qr value={listenUrl} size={240} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            translate.sundaysuite.app → tast inn <strong>{pin}</strong>
          </p>
        </section>

        {/* Channels */}
        <section className="card stack">
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
              <span className="muted" style={{ fontSize: 14 }}>
                {c.isLive ? (
                  <>
                    <span className="live-dot" /> sender
                  </>
                ) : (
                  "venter på tilkobling"
                )}
              </span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <select className="select" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Legg til språk…</option>
              {LANGS.filter((l) => !taken.has(l.code)).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={addLanguage} disabled={!adding || busy}>
              Legg til
            </button>
          </div>
        </section>

        {/* Staff links */}
        <section className="card stack">
          <div className="kicker">Til medarbeiderne</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Del disse med lydteknikeren og tolkene. De inneholder en hemmelig
            nøkkel — ikke vis dem på storskjermen.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <Qr value={sourceUrl} size={150} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>🎚️ Lydkort / kilde</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <Qr value={interpUrl} size={150} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>🎙️ Tolk</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
