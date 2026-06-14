"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { useSubscriber } from "@/lib/client/useSubscriber";
import { useCaptions } from "@/lib/client/useCaptions";
import { useTtsVoice } from "@/lib/client/useTtsVoice";
import { useWakeLock } from "@/lib/client/hooks";
import { LANGS, UI_LOCALES, isRtl, langName } from "@/lib/locales";
import { strings } from "@/lib/locale";
import type { ChannelView } from "@/lib/types";

export default function Listener() {
  const pin = String(useParams().pin);
  const { loading, id, session, error } = useStaffSession(pin);
  const { channels, status } = useLiveChannels(id);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sub = useSubscriber(audioRef, session?.localRelayUrl ?? null);
  const [aiVoice, setAiVoice] = useState(false);
  // Keep the screen awake while audio (human or AI) is playing.
  useWakeLock(sub.state === "playing" || sub.state === "connecting" || aiVoice);

  // Listener UI language — guess from the browser, let them change it.
  const [ui, setUi] = useState("en");
  useEffect(() => {
    const saved = localStorage.getItem("st-ui");
    const guess = saved || navigator.language?.split("-")[0] || "en";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only locale guess after hydration
    setUi(guess);
  }, []);
  function changeUi(code: string) {
    setUi(code);
    localStorage.setItem("st-ui", code);
  }
  const t = strings(ui);
  const rtl = isRtl(ui);

  // Phase 2: live subtitles, language-independent of the audio channel.
  const [capLang, setCapLang] = useState("");
  const capLocale = capLang || ui;
  const cap = useCaptions(id, capLocale);

  // Phase 3: optional AI voice — speak each caption line on this device.
  useTtsVoice(cap.text, capLocale, aiVoice);

  const sorted = useMemo(
    () => [...channels].sort((a, b) => (a.kind === "original" ? -1 : b.kind === "original" ? 1 : 0)),
    [channels],
  );

  if (loading) return <Center>…</Center>;
  if (error || !id || !session) return <Center>{strings(ui).notFound}</Center>;

  if (status === "ended") {
    return (
      <Center>
        <h2>{t.ended}</h2>
        <p className="muted">{t.endedSub}</p>
      </Center>
    );
  }

  function label(c: ChannelView): { icon: string; main: string; sub?: string } {
    if (c.kind === "original") return { icon: "🔊", main: t.original, sub: t.originalSub };
    const lang = LANGS.find((l) => l.code === c.targetLocale);
    return {
      icon: c.kind === "ai" ? "🤖" : (lang?.flag ?? "🎙️"),
      main: langName(c.targetLocale),
      sub: c.kind === "ai" ? t.ai : undefined,
    };
  }

  return (
    <main className="wrap" dir={rtl ? "rtl" : "ltr"} style={{ padding: "28px 20px 64px", maxWidth: 560 }}>
      <div className="stack" style={{ gap: 22 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div className="kicker">
              <span className="live-dot" /> Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
            </div>
            {session.title && <div style={{ fontWeight: 700, marginTop: 4 }}>{session.title}</div>}
          </div>
          <select
            className="select"
            aria-label={t.uiLanguage}
            value={UI_LOCALES.includes(ui as never) ? ui : "en"}
            onChange={(e) => changeUi(e.target.value)}
            style={{ width: "auto", minHeight: 40, padding: "8px 12px" }}
          >
            {UI_LOCALES.map((c) => (
              <option key={c} value={c}>
                {LANGS.find((l) => l.code === c)?.name ?? c}
              </option>
            ))}
          </select>
        </header>

        {cap.active && (
          <section className="card" style={{ padding: "14px 16px" }} dir={isRtl(capLocale) ? "rtl" : "ltr"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="muted" style={{ fontSize: 13 }}>💬 {langName(capLocale)}</span>
              <select
                className="select"
                aria-label={t.uiLanguage}
                value={LANGS.some((l) => l.code === capLocale) ? capLocale : "en"}
                onChange={(e) => setCapLang(e.target.value)}
                style={{ width: "auto", minHeight: 36, padding: "6px 10px" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={aiVoice}
                onChange={(e) => setAiVoice(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14 }}>
                🔊 AI <span className="muted">· beta</span>
              </span>
            </label>
            {cap.text && (
              <p className="captions" style={{ marginTop: 12, marginBottom: 0 }}>
                {cap.text}
              </p>
            )}
          </section>
        )}

        <div>
          <h1 style={{ fontSize: 26 }}>{t.choose}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>{t.chooseSub}</p>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          {sorted.length === 0 && <p className="muted">{t.waiting}</p>}
          {sorted.map((c) => {
            const l = label(c);
            const selected = sub.activeId === c.id;
            const ready = c.isLive && !!c.sfuSessionId;
            return (
              <button
                key={c.id}
                className="channel"
                data-selected={selected}
                disabled={!ready}
                onClick={() => (selected ? sub.stop() : sub.listen(c))}
                style={{ opacity: ready ? 1 : 0.5 }}
              >
                <span className="flag">{l.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block" }}>{l.main}</span>
                  {l.sub && (
                    <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                      {l.sub}
                    </span>
                  )}
                </span>
                <span className="muted" style={{ fontSize: 14 }}>
                  {selected
                    ? sub.state === "connecting"
                      ? t.connecting
                      : `▶ ${t.playing}`
                    : ready
                      ? ""
                      : t.waiting}
                </span>
              </button>
            );
          })}
        </div>

        {sub.activeId && (
          <button className="btn btn-block" onClick={sub.stop}>
            {t.stop}
          </button>
        )}

        <footer className="muted" style={{ fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          🎧 {t.earbuds}
          <br />
          💡 {t.keepAwake} · 🔒 {t.noRecording}
        </footer>
      </div>

      {/* Inbound audio sink. Hidden but in the DOM; playsInline for iOS. */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
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
