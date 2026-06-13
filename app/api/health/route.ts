import { createServiceClient } from "@/lib/supabase/service";
import { fail, ok } from "@/lib/server/http";

// Lightweight readiness probe for after-deploy go/no-go. Confirms the Supabase
// service connection works AND the `translator` schema is exposed (the usual
// suite gotcha) by issuing a head-only count against a translator-schema table.
// Also reports which optional integrations are configured — without leaking any
// secret values. No auth: it returns booleans only, never data.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const flags = {
    cf_realtime: !!(
      process.env.CF_REALTIME_APP_ID && process.env.CF_REALTIME_APP_TOKEN
    ),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  let sb;
  try {
    sb = createServiceClient();
  } catch (e) {
    return fail(503, "supabase_unconfigured", {
      flags,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // head:true → no rows returned; service role bypasses RLS. An error here most
  // commonly means the `translator` schema is not exposed in the Supabase API.
  const { error } = await sb
    .from("sessions")
    .select("pin", { count: "exact", head: true });

  if (error) {
    return ok({
      supabase: true,
      translator_schema: false,
      flags,
      hint: "Expose the `translator` schema: Dashboard → Settings → API → Exposed schemas → add `translator` → Save",
      error: error.message,
    });
  }

  return ok({ supabase: true, translator_schema: true, flags });
}
