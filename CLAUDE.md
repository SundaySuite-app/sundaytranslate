# CLAUDE.md — SundayTranslate

Live audio **translation + assistive listening** for the church, at
`translator.sundaysuite.app`. You walk into a service in a language you don't
speak; an interpreter in the back room reads the translation; you hear it in
your earbuds on your own phone. The same pipe carries the **original room audio**
as an assistive-listening channel for the hard-of-hearing (a hearing-loop
replacement). Fully web-based, zero install, anonymous for listeners.

## Status

**Phase 1 (human interpreter + assistive listening) — built, type-checks,
builds, lints clean. NOT yet rig-tested** (needs real Cloudflare Realtime creds
+ phones). Phases 2 (AI captions) and 3 (AI synthetic voice) are scaffolded in
the plan but not implemented.

Gate: `npm run check` (tsc + eslint + vitest). Plan:
`~/.claude/plans/kind-forging-origami.md`.

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

## ⚠️ Two things to confirm at rig-test

1. **Cloudflare Realtime SFU request/response shapes** in `lib/sfu.ts` follow the
   stable Cloudflare Calls tracks API but were written without live creds (docs
   are SPA-rendered; couldn't fetch exact JSON). Confirm against a real Realtime
   app; adjust `lib/sfu.ts` + `app/api/rt/[...path]/route.ts` if the shapes drift.
   May also need **Cloudflare TURN** creds for listeners on cellular (host/srflx
   candidates cover same-LAN; add TURN to `ICE` in `lib/sfu.ts`).
2. **iOS audio under screen-lock** — the make-or-break UX. Mitigated with
   MediaSession + Wake Lock + gesture-primed `play()` (`useSubscriber` +
   `useWakeLock`). Test on a real iPhone with the screen locked and earbuds in.

## Rig-test (Phase 1)

Prereqs: `.env.local` from `.env.example` with the shared Supabase anon +
service-role keys, a Cloudflare Realtime `CF_REALTIME_APP_ID`/`CF_REALTIME_APP_TOKEN`,
and the migration applied + schema exposed.

1. `npm run dev`. On a laptop open `/` → **Start sesjon** → you land on `/o/<id>`.
2. Open the **Lydkort/kilde** QR on a device wired to the mixer (or any laptop):
   grant audio, pick the sound card, **Start sending**. The operator shows the
   Original channel as *sender*.
3. On a phone, open the **Tolk** QR, pick a language, **Start tolking**, speak.
4. On another phone, scan the listener PIN/QR (`/<pin>`), pick the language →
   you should hear the interpreter < ~1 s behind, and **Original** should give
   clean room audio. **Lock the iPhone and confirm audio keeps playing.**

## Deploy

```
set -a && source .env.production.local && set +a
npm run cf:build && npx opennextjs-cloudflare deploy
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CF_REALTIME_APP_ID
npx wrangler secret put CF_REALTIME_APP_TOKEN
```

`production-branch`/custom domain `translator.sundaysuite.app` is in
`wrangler.jsonc`. Verify against the live domain like the other suite apps.

## Phase 2 / 3 (next)

- **AI captions**: source streams the Original audio to `/api/asr` → Workers AI
  (Deepgram Nova-3 streaming STT, or Whisper large-v3-turbo) → translate (reuse
  the cached Claude translator from SundayStage, `app/api/sessions/[id]/translate`)
  → push caption lines over the same Supabase broadcast (`events.caption`, already
  defined) → listener renders subtitles. Bind Workers AI in `wrangler.jsonc`.
- **AI synthetic voice**: caption text → Workers AI TTS (Deepgram Aura-1 /
  MeloTTS) → publish as an `ai`-kind channel on the SFU. Listener selects it like
  any other channel (`kind:"ai"` already modeled end-to-end).

## Conventions

- Norwegian-first staff UI; the **listener** chrome is translated (`lib/locale.ts`,
  7 locales, RTL for Arabic). Dark-first, suite gold `#D4A73A` thread + this app's
  teal jewel tone `#2BB3C0`.
- No audio is recorded. Sessions self-expire after 24 h (lazy GC on create).
