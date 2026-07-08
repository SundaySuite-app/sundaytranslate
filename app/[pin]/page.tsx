"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useStaffSession } from "@/lib/client/useStaffSession";
import { useLiveChannels } from "@/lib/client/useLiveChannels";
import { useSubscriber } from "@/lib/client/useSubscriber";
import { useCaptions } from "@/lib/client/useCaptions";
import { useTtsVoice } from "@/lib/client/useTtsVoice";
import { usePresenceTrack } from "@/lib/client/usePresence";
import { useWakeLock } from "@/lib/client/hooks";
import { channels as rtChannels } from "@/lib/realtime";
import { LANGS, UI_LOCALES, isRtl, langName } from "@/lib/locales";
import { strings } from "@/lib/locale";
import type { ChannelView } from "@/lib/types";

export default function Listener() {
  const pin = String(useParams().pin);
  const { loading, id, session, error } = useStaffSession(pin);
  const { channels, status } = useLiveChannels(id);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sub = useSubscriber(audioRef, id, session?.localRelayUrl ?? null);
  const [aiVoice, setAiVoice] = useState(false);

  // Follow the publisher: feed fresh channel data into the subscription so a
  // restarted interpreter (new SFU coordinates) or an offline→online flip
  // reconnects the listener automatically.
  const { activeId, sync } = sub;
  useEffect(() => {
    if (!activeId) return;
    sync(channels.find((c) => c.id === activeId) ?? null);
  }, [channels, activeId, sync]);

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

  // Anonymous head-count for the operator's console (best-effort presence).
  usePresenceTrack(id ? rtChannels.presence(id) : null, status !== "ended");

  // Phase 2: live subtitles, language-independent of the audio channel.
  const [capLang, setCapLang] = useState("");
  const capLocale = capLang || ui;
  const cap = useCaptions(id, capLocale);

  // HoH read-along: adjustable subtitle size, remembered on this phone.
  const [capScale, setCapScale] = useState(1);
  useEffect(() => {
    const saved = Number(localStorage.getItem("st-cap-scale"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only restore after hydration
    if (saved === 1.4 || saved === 1.8) setCapScale(saved);
  }, []);
  function cycleCapScale() {
    const next = capScale >= 1.8 ? 1 : capScale >= 1.4 ? 1.8 : 1.4;
    setCapScale(next);
    localStorage.setItem("st-cap-scale", String(next));
  }

  // Phase 3: optional AI voice — speak each caption line on this device.
  const tts = useTtsVoice(cap.text, capLocale, aiVoice, id);

  // Keep the screen awake while audio is playing — the AI voice only counts
  // while captions are actually flowing (not a stale toggle from earlier).
  useWakeLock(sub.state === "playing" || sub.state === "connecting" || (aiVoice && cap.active));

  const sorted = useMemo(
    () => [...channels].sort((a, b) => (a.kind === "original" ? -1 : b.kind === "original" ? 1 : 0)),
    [channels],
  );

  // The captioner only produces the source language + the channel targets —
  // offering every language in the picker gives dead, empty panels. (No manual
  // memo: the React Compiler handles it, and the work is trivial anyway.)
  const capSet = new Set<string>();
  if (session?.sourceLocale) capSet.add(session.sourceLocale);
  channels.forEach((c) => {
    if (c.targetLocale) capSet.add(c.targetLocale);
  });
  if (capLocale) capSet.add(capLocale);
  const capLocales = LANGS.filter((l) => capSet.has(l.code));

  if (loading) return <Center>…</Center>;
  if (error || !id || !session)
    return (
      <Center>
        {strings(ui).notFound}
        <button
          className="btn btn-block"
          style={{ marginTop: 16 }}
          onClick={() => window.location.reload()}
        >
          {strings(ui).retry}
        </button>
      </Center>
    );

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
              <span className="live-dot" aria-hidden="true" /> Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
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
          <section
            className="card"
            style={{ padding: "14px 16px" }}
            dir={isRtl(capLocale) ? "rtl" : "ltr"}
            aria-label={`${t.uiLanguage}: ${langName(capLocale)}`}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                <span aria-hidden="true">💬 </span>{langName(capLocale)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  onClick={cycleCapScale}
                  aria-label={t.textSize}
                  title={t.textSize}
                  style={{ minHeight: 36, padding: "6px 10px", fontSize: 14 }}
                >
                  <span style={{ fontSize: 12 }}>A</span>A
                </button>
                <select
                  className="select"
                  aria-label={t.uiLanguage}
                  value={capLocales.some((l) => l.code === capLocale) ? capLocale : (capLocales[0]?.code ?? "en")}
                  onChange={(e) => setCapLang(e.target.value)}
                  style={{ width: "auto", minHeight: 36, padding: "6px 10px" }}
                >
                  {capLocales.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={aiVoice}
                onChange={(e) => {
                  // Unlock the TTS Audio element inside this gesture (iOS).
                  if (e.target.checked) tts.prime();
                  setAiVoice(e.target.checked);
                }}
                aria-label={`${t.ai} (beta)`}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14 }}>
                <span aria-hidden="true">🔊 </span>AI <span className="muted">· beta</span>
              </span>
            </label>
            {cap.lines.length > 0 && (
              <div style={{ marginTop: 12, fontSize: `${capScale}em` }}>
                {cap.lines.length > 1 && (
                  <p className="captions muted" style={{ margin: "0 0 6px", opacity: 0.6 }}>
                    {cap.lines[cap.lines.length - 2]}
                  </p>
                )}
                <p className="captions" style={{ margin: 0 }} aria-live="polite" aria-atomic="true">
                  {cap.text}
                </p>
              </div>
            )}
          </section>
        )}

        <div>
          <h1 id="choose-heading" style={{ fontSize: 26 }}>{t.choose}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>{t.chooseSub}</p>
        </div>

        {/* Playback status, announced as it changes. */}
        <p role="status" aria-live="polite" className="visually-hidden">
          {sub.activeId
            ? sub.state === "connecting"
              ? t.connecting
              : sub.state === "error"
                ? t.connectionLost
                : t.playing
            : ""}
        </p>

        <div className="stack" style={{ gap: 12 }} role="group" aria-labelledby="choose-heading">
          {sorted.length === 0 && <p className="muted">{t.waiting}</p>}
          {sorted.map((c) => {
            const l = label(c);
            const selected = sub.activeId === c.id;
            const ready = c.isLive && !!c.sfuSessionId;
            const stateText = selected
              ? sub.state === "connecting"
                ? t.connecting
                : sub.state === "error"
                  ? `${t.connectionLost} ${t.retry}`
                  : t.playing
              : ready
                ? ""
                : t.waiting;
            return (
              <button
                key={c.id}
                className="channel"
                data-selected={selected}
                disabled={!ready && !selected}
                aria-pressed={selected}
                aria-label={`${l.main}${l.sub ? ` — ${l.sub}` : ""}${stateText ? `. ${stateText}` : ""}`}
                onClick={() =>
                  selected
                    ? sub.state === "error"
                      ? sub.retry()
                      : sub.stop()
                    : sub.listen(c)
                }
                style={{ opacity: ready || selected ? 1 : 0.5 }}
              >
                <span className="flag" aria-hidden="true">{l.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block" }}>{l.main}</span>
                  {l.sub && (
                    <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                      {l.sub}
                    </span>
                  )}
                </span>
                <span
                  className="muted"
                  style={{ fontSize: 14, ...(selected && sub.state === "error" ? { color: "#e5484d" } : {}) }}
                  aria-hidden="true"
                >
                  {selected
                    ? sub.state === "connecting"
                      ? t.connecting
                      : sub.state === "error"
                        ? `⚠ ${t.retry}`
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
          <span aria-hidden="true">🎧 </span>{t.earbuds}
          <br />
          <span aria-hidden="true">💡 </span>{t.keepAwake} · <span aria-hidden="true">🔒 </span>{t.noRecording}
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
