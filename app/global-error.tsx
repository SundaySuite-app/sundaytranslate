"use client";

// Catches errors in the root layout itself. Must render its own <html>/<body>
// and cannot rely on the app stylesheet, so it is fully inline-styled.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="no">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0e1418",
          color: "#eaf1f3",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div role="alert">
          <div style={{ fontSize: 40, color: "#2bb3c0" }} aria-hidden="true">
            🎧
          </div>
          <h2 style={{ fontWeight: 700 }}>Noe gikk galt</h2>
          <p style={{ color: "#93a3ab" }}>Last inn siden på nytt.</p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: "12px 22px",
              minHeight: 44,
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#5fd6e0,#2bb3c0,#1b8d99)",
              color: "#04231f",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Prøv igjen
          </button>
        </div>
      </body>
    </html>
  );
}
