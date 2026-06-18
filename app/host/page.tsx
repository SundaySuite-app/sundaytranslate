import { redirect } from "next/navigation";

import { requireHost, HostAuthError } from "@/lib/server/host-auth";
import { listSessionsByOwner } from "@/lib/server/sessions";
import { hostStrings as t } from "@/lib/host-strings";

import { HostDashboard } from "./HostDashboard";

/**
 * Host dashboard (server component). Authorizes via the single fail-closed
 * `requireHost()` allowlist, then lists this host's own oversettelses-sesjoner.
 *
 *  - not signed in  → /host/login (middleware already redirects, this is the
 *    belt-and-braces guard for direct hits / cached requests).
 *  - signed in but not allow-listed → a clear message instead of a blank 403.
 */
export const dynamic = "force-dynamic";

export default async function HostPage() {
  let host;
  try {
    host = await requireHost();
  } catch (e) {
    if (e instanceof HostAuthError && e.status === 401) redirect("/host/login");
    // 403 not_allowlisted — signed in, but not authorized for this app.
    return (
      <main className="center-screen">
        <div className="wrap" style={{ maxWidth: 460 }}>
          <div className="card stack" style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{t.dashTitle}</h1>
            <p className="muted" style={{ margin: 0 }}>
              Kontoen din har ikke tilgang til SundayTranslate-verten ennå.
              Kontakt administrator.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const sessions = await listSessionsByOwner(host.id);
  return <HostDashboard email={host.email} initialSessions={sessions} />;
}
