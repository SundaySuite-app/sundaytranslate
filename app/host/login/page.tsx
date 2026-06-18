"use client";

import { useState } from "react";
import Link from "next/link";

import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { hostStrings as t } from "@/lib/host-strings";

/**
 * OPTIONAL host/operatør login. Magic-link OR Sunday Account / Google, all via
 * the ISSUER project (Sunday Account). This surface is the only place anonymous
 * staff become a signed-in host; everything else (listener/source/interpreter)
 * stays code-based and never sees this page.
 */
export default function HostLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const supabase = createAuthBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setErr(t.loginError);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="center-screen">
      <div className="wrap" style={{ maxWidth: 460 }}>
        <div className="stack" style={{ gap: 24 }}>
          <header className="stack" style={{ gap: 8, textAlign: "center" }}>
            <div className="kicker">Sunday Suite</div>
            <h1 style={{ fontSize: "clamp(28px,6vw,40px)", margin: 0 }}>
              Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {t.loginLede}
            </p>
          </header>

          <div className="card stack">
            {sent ? (
              <p style={{ margin: 0 }}>{t.magicLinkSent}</p>
            ) : (
              <form className="stack" onSubmit={sendMagicLink}>
                <div className="field">
                  <label className="label" htmlFor="email">
                    {t.emailLabel}
                  </label>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    autoComplete="email"
                  />
                </div>
                {err && (
                  <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p>
                )}
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? t.sending : t.sendMagicLink}
                </button>
              </form>
            )}
          </div>

          <button
            className="btn btn-ghost btn-block"
            onClick={signInWithGoogle}
            type="button"
          >
            {t.signInWithSunday}
          </button>

          <p className="muted" style={{ textAlign: "center", margin: 0 }}>
            <Link href="/">{t.backToStart}</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
