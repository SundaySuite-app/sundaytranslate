/**
 * GET /api/sessions/<id>/captions — latest caption line per locale, so a
 * late-joining listener sees the current subtitle without waiting for the next
 * line. Public (read-side, like by-pin).
 */
import { ok } from "@/lib/server/http";
import { getCaptions } from "@/lib/server/sessions";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return ok({ captions: await getCaptions(id) });
}
