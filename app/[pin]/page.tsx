"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { useSubscriber } from "@/lib/client/useSubscriber";
import { useWakeLock } from "@/lib/client/hooks";
import { LANGS, UI_LOCALES, isRtl, langName } from "@/lib/locales";
import { strings } from "@/lib/locale";
import type { ChannelView } from "@/lib/types";

export default function Listener() {
  const pin = String(useParams().pin);
  const { loading, id, session, error } = useStaffSession(pin);
  const { channels, status } = useLiveChannels(id);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sub = useSubscriber(audioRef);
  useWakeLock(sub.state === "playing" || sub.state === "connecting");

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
