# CLAUDE.md — SundayTranslate

Live audio **translation + assistive listening** for the church at
`translate.sundaysuite.app`: interpreter → listeners' phones, plus the original
room audio as a hearing-loop replacement. Web-only, zero install, anonymous listeners.
Phase 1 (human interpreter) is the reliable core; Phase 2 (AI captions) and
Phase 3 (AI TTS voice) degrade off cleanly without the AI binding/key.

Gate: `npm run check` (tsc + eslint + vitest).

**Status, rig-test, deploy, Phase 2/3 internals: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)** — read it before deploying.
Hard rules from there:
- Deploy is **manual only** (GitHub Actions deploy has never worked) and **must pass the `--var` issuer overrides** — plain deploy ships `REPLACE-issuer-*` placeholders and breaks `/host` login.
- Live in prod but **not rig-tested** (SFU media path + iOS lock-screen audio).

## Architecture (all Cloudflare + Supabase — no new vendors)

- **Shell**: Next.js 16 + OpenNext → Cloudflare Worker (suite standard).
- **Signaling / sessions / channel list**: Supabase `translator` schema on the
  shared "Sunday" project (`rkiahljrkormwzogghpc`; Plan owns `public`, Info
  `info`, Stage `stage`). RLS deny-all; all reads/writes via service-role API
  routes. **Supabase Realtime broadcast** (not postgres_changes) for the live
  channel list + polling fallback — copied verbatim from SundayStage/Quiz
  (`lib/realtime.ts`, `lib/client/useChannel.ts`, `lib/server/broadcast.ts`).
- **Live audio transport (the only genuinely new piece)**: **Cloudflare Realtime
  SFU** via the tracks API (`/sessions/new`, `/tracks/new` local/remote,
  `/renegotiate`). The browser runs the `RTCPeerConnection` (`lib/sfu.ts`); the
  App Token stays server-side behind the `/api/rt/[...path]` proxy. One publisher
  per channel, many listeners pull. Opus audio ≈ 40 kbps → well inside the SFU's
  1000 GB free tier.

### Roles & routes

| Route | Who | What |
|-------|-----|------|
| `/` | anyone | Landing — start a session (operator) or join by PIN (listener) |
| `/o/[id]?pin=NNNNNN#<secret>` | operator | Big-screen PIN+QR, define language channels, staff QRs, end |
| `/kilde/[pin]#<secret>` | sound desk | Pick the sound card → publish the **Original** channel |
| `/tolk/[pin]#<secret>` | interpreter | Pick a language → publish their mic as that channel |
| `/[pin]` | listener | Pick a channel → hear it in earbuds. Anonymous. |

The session **secret** (write bearer) is returned once at creation and travels
to staff in the **URL fragment** (`#…`) of the operator's staff QRs — never to
listeners, never to the server logs. `verifySecret` gates every publish/end.

### Data model (`supabase/migrations/20260613140000_translator_schema.sql`)

`sessions` (pin, secret, source_locale, status, 24h expiry) + `channels`
(kind original|human|ai, target_locale, the SFU `sfu_session_id`+`track_name`,
`is_live`). RPCs: `create_session` (atomic PIN + secret, lazy GC), `session_by_pin`.
**After applying: Dashboard → Settings → API → Exposed schemas → add `translator`**
(the known suite gotcha) and the anon role needs nothing else (broadcast is a bus).

## Conventions

- Norwegian-first staff UI; the **listener** chrome is translated (`lib/locale.ts`,
  7 locales, RTL for Arabic). Dark-first, suite gold `#D4A73A` thread + this app's
  teal jewel tone `#2BB3C0`.
- No audio is recorded. Sessions self-expire after 24 h (lazy GC on create).
