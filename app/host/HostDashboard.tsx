"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { hostStrings as t } from "@/lib/host-strings";
import { langName } from "@/lib/locales";

interface OwnedSession {
  id: string;
  pin: string;
  title: string;
  sourceLocale: string;
  status: "live" | "ended";
  createdAt: string;
  expiresAt: string;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("no-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HostDashboard({
  email,
  initialSessions,
}: {
  email: string;
  initialSessions: OwnedSession[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function newSession() {
    // Reuse the existing anonymous create flow — the API best-effort stamps the
    // owner from the signed-in session, so the new session lands here too.
    setErr(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", sourceLocale: "no" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "feil");
      router.push(`/o/${data.id}?pin=${data.pin}#${data.secret}`);
    } catch {
      setErr(t.loadError);
    }
  }

  async function open(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/host/sessions/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "feil");
      router.push(`/o/${id}?pin=${data.pin}#${data.secret}`);
    } catch {
      setErr(t.loadError);
      setBusyId(null);
    }
  }

  async function del(id: string) {
    if (!confirm(t.confirmDelete)) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/host/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "feil");
      }
      setSessions((s) => s.filter((x) => x.id !== id));
    } catch {
      setErr(t.deleteError);
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.push("/host/login");
    router.refresh();
  }

  return (
    <main className="center-screen" style={{ alignItems: "flex-start", paddingTop: "8vh" }}>
      <div className="wrap" style={{ maxWidth: 680, width: "100%" }}>
        <div className="stack" style={{ gap: 22 }}>
          <header
            className="stack"
            style={{ gap: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <div className="stack" style={{ gap: 4 }}>
              <div className="kicker">SundayTranslate</div>
              <h1 style={{ fontSize: "clamp(24px,5vw,34px)", margin: 0 }}>{t.dashTitle}</h1>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                {email} · {t.dashLede}
              </p>
            </div>
            <div className="stack" style={{ gap: 8, flexDirection: "row" }}>
              <button className="btn btn-primary" onClick={newSession} type="button">
                {t.newSession}
              </button>
              <button className="btn btn-ghost" onClick={signOut} type="button">
                {t.signOut}
              </button>
            </div>
          </header>

          {err && <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p>}

          {sessions.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>{t.noSessions}</p>
            </div>
          ) : (
            <ul className="stack" style={{ gap: 12, listStyle: "none", padding: 0, margin: 0 }}>
              {sessions.map((s) => (
                <li key={s.id} className="card stack" style={{ gap: 10 }}>
                  <div
                    className="stack"
                    style={{ gap: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}
                  >
                    <strong style={{ fontSize: 17 }}>{s.title || t.untitled}</strong>
                    <span
                      className="muted"
                      style={{
                        fontSize: 12,
                        color: s.status === "live" ? "var(--accent)" : undefined,
                      }}
                    >
                      {s.status === "live" ? t.statusLive : t.statusEnded}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t.pinLabel} {s.pin} · {langName(s.sourceLocale)} · {t.created} {fmt(s.createdAt)}
                  </div>
                  <div className="stack" style={{ gap: 8, flexDirection: "row", flexWrap: "wrap" }}>
                    {s.status === "live" && (
                      <button
                        className="btn btn-primary"
                        onClick={() => open(s.id)}
                        disabled={busyId === s.id}
                        type="button"
                      >
                        {t.open}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      onClick={() => del(s.id)}
                      disabled={busyId === s.id}
                      type="button"
                    >
                      {busyId === s.id ? t.deleting : t.del}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
