import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAdminEmail } from "@/lib/server/host-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ── pure allowlist (the single authz gate) ──────────────────────────────────
describe("isAdminEmail — fail-closed allowlist", () => {
  it("is empty/closed when TRANSLATE_ADMIN_EMAILS is unset", () => {
    vi.stubEnv("TRANSLATE_ADMIN_EMAILS", "");
    expect(isAdminEmail("anyone@menigheten.no")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    vi.stubEnv("TRANSLATE_ADMIN_EMAILS", "Host@Menigheten.no, other@x.no");
    expect(isAdminEmail("host@menigheten.no")).toBe(true);
    expect(isAdminEmail("  HOST@MENIGHETEN.NO ")).toBe(true);
    expect(isAdminEmail("other@x.no")).toBe(true);
    expect(isAdminEmail("nope@x.no")).toBe(false);
  });

  it("accepts comma, space, semicolon and newline separators", () => {
    vi.stubEnv("TRANSLATE_ADMIN_EMAILS", "a@x.no b@x.no;c@x.no\nd@x.no");
    for (const e of ["a@x.no", "b@x.no", "c@x.no", "d@x.no"]) {
      expect(isAdminEmail(e)).toBe(true);
    }
  });
});

// ── requireHost + the owner-gated DELETE route (401 / 403 / 404 / 200) ───────
// We mock the two Supabase clients so no network / env is needed: the issuer
// auth client supplies the "signed-in user", the service client backs the
// owner-scoped delete.

let mockUser: { id: string; email: string | null } | null = null;
const deleteSpy = vi.fn();

vi.mock("@/lib/supabase/auth-server", () => ({
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      // captions cleanup: from("captions").delete().eq(...)
      // sessions delete: from("sessions").delete().eq().eq().select()
      delete: () => {
        const chain = {
          _eqs: [] as Array<[string, unknown]>,
          eq(col: string, val: unknown) {
            this._eqs.push([col, val]);
            return this;
          },
          select() {
            return Promise.resolve(deleteSpy(table, this._eqs));
          },
          then(onF: (v: unknown) => unknown) {
            // captions.delete().eq() is awaited directly (no .select())
            return Promise.resolve({ data: null, error: null }).then(onF);
          },
        };
        return chain;
      },
    }),
  }),
}));

async function callDelete(id: string) {
  const { DELETE } = await import("@/app/api/host/sessions/[id]/route");
  const res = await DELETE(new Request(`http://x/api/host/sessions/${id}`), {
    params: Promise.resolve({ id }),
  });
  return res;
}

describe("DELETE /api/host/sessions/[id] — owner-gated", () => {
  beforeEach(() => {
    vi.resetModules();
    mockUser = null;
    deleteSpy.mockReset();
    vi.stubEnv("TRANSLATE_ADMIN_EMAILS", "host@menigheten.no");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://data.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });

  it("401 when not signed in", async () => {
    mockUser = null;
    const res = await callDelete("s1");
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "not_signed_in" });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("403 when signed in but not allow-listed", async () => {
    mockUser = { id: "u1", email: "stranger@x.no" };
    const res = await callDelete("s1");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "not_allowlisted" });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("404 when the session is not owned by the host (nothing deleted)", async () => {
    mockUser = { id: "u1", email: "host@menigheten.no" };
    deleteSpy.mockReturnValue({ data: [], error: null });
    const res = await callDelete("s-not-mine");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
    // The delete was attempted but scoped to (id, host_user_id=u1).
    const [, eqs] = deleteSpy.mock.calls.at(-1)!;
    expect(eqs).toEqual(
      expect.arrayContaining([
        ["id", "s-not-mine"],
        ["host_user_id", "u1"],
      ]),
    );
  });

  it("200 when the host owns the session (row removed)", async () => {
    mockUser = { id: "u1", email: "host@menigheten.no" };
    deleteSpy.mockReturnValue({ data: [{ id: "s1" }], error: null });
    const res = await callDelete("s1");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});

// ── by-owner list is scoped to the host id ──────────────────────────────────
describe("listSessionsByOwner — scoped to host", () => {
  const captured: Record<string, unknown> = {};

  beforeEach(() => {
    vi.resetModules();
    captured.eqCol = undefined;
    captured.eqVal = undefined;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://data.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });

  it("filters host_user_id = me and maps rows newest-first", async () => {
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq(col: string, val: unknown) {
              captured.eqCol = col;
              captured.eqVal = val;
              return this;
            },
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: "s1",
                    pin: "000111",
                    title: "Gudstjeneste",
                    source_locale: "no",
                    status: "live",
                    created_at: "2026-06-18T10:00:00Z",
                    expires_at: "2026-06-19T10:00:00Z",
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    }));
    const { listSessionsByOwner } = await import("@/lib/server/sessions");
    const rows = await listSessionsByOwner("u1");
    expect(captured.eqCol).toBe("host_user_id");
    expect(captured.eqVal).toBe("u1");
    expect(rows).toEqual([
      {
        id: "s1",
        pin: "000111",
        title: "Gudstjeneste",
        sourceLocale: "no",
        status: "live",
        createdAt: "2026-06-18T10:00:00Z",
        expiresAt: "2026-06-19T10:00:00Z",
      },
    ]);
  });
});
