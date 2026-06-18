"use client";

// Route-level error boundary — a transient render/runtime error shows a
// friendly recovery screen instead of a blank, unrecoverable page.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="center-screen">
      <div
        className="card stack"
        style={{ maxWidth: 420, textAlign: "center", alignItems: "center", gap: 14 }}
        role="alert"
      >
        <div className="kicker">
          Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
        </div>
        <div style={{ fontSize: 40 }} aria-hidden="true">
          🎧
        </div>
        <h2 style={{ fontSize: 24 }}>Noe gikk galt</h2>
        <p className="muted" style={{ margin: 0 }}>
          Prøv på nytt. Ingen lyd tas opp, og ingenting går tapt.
        </p>
        <div className="stack" style={{ gap: 10, width: "100%", marginTop: 6 }}>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => reset()}>
            Prøv igjen
          </button>
          <button
            className="btn btn-block"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Til forsiden
          </button>
        </div>
      </div>
    </main>
  );
}
