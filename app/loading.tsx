// Route-level loading state — shown while a console's data is being fetched.
export default function Loading() {
  return (
    <main className="center-screen">
      <div
        className="card stack"
        style={{ maxWidth: 360, textAlign: "center", alignItems: "center", gap: 14 }}
        role="status"
        aria-live="polite"
      >
        <span className="spinner" aria-hidden="true" />
        <div className="kicker">
          Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Laster… <span className="visually-hidden">Vennligst vent</span>
        </p>
      </div>
    </main>
  );
}
