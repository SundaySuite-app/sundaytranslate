import Link from "next/link";

// 404 — a missing session/PIN or a stale link lands here.
export default function NotFound() {
  return (
    <main className="center-screen">
      <div
        className="card stack"
        style={{ maxWidth: 420, textAlign: "center", alignItems: "center", gap: 14 }}
      >
        <div className="kicker">
          Sunday<span style={{ color: "var(--accent)" }}>Translate</span>
        </div>
        <div style={{ fontSize: 40 }} aria-hidden="true">
          🔍
        </div>
        <h2 style={{ fontSize: 24 }}>Fant ikke siden</h2>
        <p className="muted" style={{ margin: 0 }}>
          Lenken kan være utdatert, eller sesjonen er avsluttet. Tast inn PIN-koden
          på forsiden for å bli med.
        </p>
        <Link className="btn btn-primary btn-lg btn-block" href="/" style={{ marginTop: 6 }}>
          Til forsiden
        </Link>
      </div>
    </main>
  );
}
