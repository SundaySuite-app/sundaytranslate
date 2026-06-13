"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidPin } from "@/lib/codes";
import { LANGS } from "@/lib/locales";

export default function Landing() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("no");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceLocale: source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "feil");
      router.push(`/o/${data.id}?pin=${data.pin}#${data.secret}`);
    } catch {
      setErr("Kunne ikke starte sesjonen. Prøv igjen.");
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    if (isValidPin(pin)) router.push(`/${pin.trim()}`);
    else setErr("PIN-koden er 6 siffer.");
  }

  return (
    <main className="center-screen">
      <div className="wrap" style={{ maxWidth: 560 }}>
        <div className="stack" style={{ gap: 28 }}>
          <header className="stack" style={{ gap: 8, textAlign: "center" }}>
            <div className="kicker">Sunday Suite</div>
            <h1 style={{ fontSize: "clamp(34px,7vw,52px)" }}>
              Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
            </h1>
            <p className="muted" style={{ fontSize: 18, margin: 0 }}>
              Live oversettelse og lytteanlegg for menigheten. Tolken leser inn
              oversettelsen — du hører den på din egen telefon.
            </p>
          </header>

          {/* Listener join */}
          <form className="card stack" onSubmit={join}>
            <div className="field">
              <label className="label" htmlFor="pin">
                Har du en PIN-kode? Bli med
              </label>
              <input
                id="pin"
                className="input"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                style={{ fontSize: 24, letterSpacing: "0.2em", textAlign: "center" }}
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit">
              Hør oversettelsen
            </button>
          </form>

          {/* Operator start */}
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Skal du drive oversettelsen? Start en sesjon
            </summary>
            <div className="stack" style={{ marginTop: 18 }}>
              <div className="field">
                <label className="label" htmlFor="title">
                  Navn på samlingen (valgfritt)
                </label>
                <input
                  id="title"
                  className="input"
                  placeholder="Søndagsgudstjeneste"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="src">
                  Talespråk i rommet
                </label>
                <select
                  id="src"
                  className="select"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-block" onClick={start} disabled={busy}>
                {busy ? "Starter…" : "Start sesjon"}
              </button>
            </div>
          </details>

          {err && (
            <p style={{ color: "var(--danger)", textAlign: "center", margin: 0 }}>{err}</p>
          )}
          <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
            Ingen lyd tas opp. Bruk ørepropper for best opplevelse.
          </p>
        </div>
      </div>
    </main>
  );
}
