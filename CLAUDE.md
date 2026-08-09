# CLAUDE.md — SundayTranslate

Live audio **translation + assistive listening** for the church, at
`translate.sundaysuite.app`. You walk into a service in a language you don't
speak; an interpreter in the back room reads the translation; you hear it in
your earbuds on your own phone. The same pipe carries the **original room audio**
as an assistive-listening channel for the hard-of-hearing (a hearing-loop
replacement). Fully web-based, zero install, anonymous for listeners.

## Status

**All three phases implemented; type-checks, builds, lints clean. Live in prod
since 2026-08-08 — but still NOT rig-tested** (the Realtime media path and iOS
lock-screen playback need real phones on a real rig; see Rig-test below).

- **Repo**: `SundaySuite-app/sundaytranslate` — moved into the org and made
  **public** (2026-08-08). Working clone: `~/sunday-work/sundaytranslate`.
- **Prod**: Worker version `cb19fce4`, deployed **2026-08-08** from that day's
  main. Before then prod had been serving **June** code — the July round
  (self-healing audio, liveness, AI cost guards, host-login) only went live
  with this deploy. `/api/health` reports supabase ✅, translator_schema ✅,
  cf_realtime ✅, **anthropic ❌** (no `ANTHROPIC_API_KEY` → captions stay
  source-language only; human interpretation unaffected).
- **Database**: **all 5 migrations verified applied** in prod (2026-08-08) —
  not assumed: column probes distinguished 42501 from 42703 for
  `local_relay_url` / `host_user_id` / `captions`, and the realtime-RLS policy
  (`20260708120000_realtime_authz.sql`) was confirmed by actually subscribing
  to a private channel and getting `SUBSCRIBED`.
- **Local relay** (`POST /api/relay/enroll`) still answers 503
  `relay_broker_unconfigured`: 4 of its 5 secrets are unset. Code + DB are
  done; only the owner steps remain (wildcard cert + 4 Worker secrets) —
  `sunday-suite/SundayTranslate-STATUS-RELAY-2026-08-08.md` §2.

- **Phase 1** human interpreter + assistive listening — full, the reliable core.
  **Hardened (July 2026)**: both ends self-heal — the listener auto-resubscribes
  with backoff and follows publisher restarts (`useSubscriber.sync()` fed from
  the live channel list); the publisher re-publishes with the mic kept hot,
  watches `track.onended` (unplugged sound card), and flips its channel offline
  via a `pagehide` keepalive beacon (no zombie "live" channels). Expired
  sessions are rejected at read time (`verifySecret`/`getSession`); `/asr` is
  rate-limited + body-capped; server-side fetches (broadcast, SFU proxy) are
  timeout-bounded. Operator: presence head-count, channel delete, staff QRs
  hidden behind a reveal. Tolk: mute, same-language collision warning, wake
  lock. Listener: lock-screen play/pause + visibility resume.
- **Phase 2** AI captions — source feeds 5s chunks → Whisper STT → Claude
  translate → broadcast → listener subtitles (source + channel targets, incl.
  source for HoH read-along; history line + text-size toggle; the panel
  auto-hides after 90s of caption silence). Degrades off cleanly with no AI
  binding / no key — and repeated ASR failures surface a warning on the kilde
  console instead of failing invisibly.
- **Phase 3** AI synthetic voice — listener-side TTS of caption lines (no
  server WebRTC: the phone speaks). Experimental; MeloTTS language coverage is
  limited (en/es/fr/zh/ja/ko) — others get captions only.

Gate: `npm run check` (tsc + eslint + vitest). The implementation plan for
this feature set has been completed and removed.

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

1. **Cloudflare Realtime SFU shapes** in `lib/sfu.ts` are now **VERIFIED** against
   Cloudflare's official `realtime-examples/echo` client — base, auth,
   `/sessions/new`, `/tracks/new` (local+remote), `/renegotiate`, and the
   `sessionDescription`/`tracks`/`requiresImmediateRenegotiation` fields all match.
   What's left to prove at rig-test is the *live media path*: real creds, NAT
   traversal, codecs. For restrictive church wifi / cellular, set
   `NEXT_PUBLIC_RT_ICE` (JSON RTCIceServer[] incl. a **Cloudflare TURN** entry) —
   no code change; default is Cloudflare STUN.
2. **iOS audio under screen-lock** — the make-or-break UX. Mitigated with
   MediaSession + Wake Lock + gesture-primed `play()` (`useSubscriber` +
   `useWakeLock`). Test on a real iPhone with the screen locked and earbuds in.

## Rig-test (Phase 1)

The full 8-step protocol (incl. relay fallback + the iOS lock test) is in
`sunday-suite/SundayTranslate-STATUS-RELAY-2026-08-08.md` §3. Against **prod**
no prereqs remain — it is deployed and the migrations are verified applied.
To run it **locally** instead: `.env.local` from `.env.example` with the shared
Supabase anon + service-role keys, a Cloudflare Realtime
`CF_REALTIME_APP_ID`/`CF_REALTIME_APP_TOKEN`, and the migrations applied +
schema exposed.

1. `npm run dev`. On a laptop open `/` → **Start sesjon** → you land on `/o/<id>`.
2. Open the **Lydkort/kilde** QR on a device wired to the mixer (or any laptop):
   grant audio, pick the sound card, **Start sending**. The operator shows the
   Original channel as *sender*.
3. On a phone, open the **Tolk** QR, pick a language, **Start tolking**, speak.
4. On another phone, scan the listener PIN/QR (`/<pin>`), pick the language →
   you should hear the interpreter < ~1 s behind, and **Original** should give
   clean room audio. **Lock the iPhone and confirm audio keeps playing.**

## Deploy

Public config (`NEXT_PUBLIC_SUPABASE_URL` + the Sunday-Account issuer pair)
lives in `wrangler.jsonc` `vars` — the SERVER reads these at runtime in the
Worker (build-time `NEXT_PUBLIC_*` inlining only reaches the client bundle).
The only secret **required for host-start** is `SUPABASE_SERVICE_ROLE_KEY`;
without it `POST /api/sessions` returns 503 `service_unconfigured` and
`/api/health` says so.

⚠️ **Gotcha — the issuer placeholders.** `wrangler.jsonc` ships
`REPLACE-issuer-ref` / `REPLACE-issuer-anon-key` for
`NEXT_PUBLIC_SUNDAY_AUTH_URL` / `_ANON_KEY`. A plain deploy publishes those
placeholders and `/host` login then silently can't work server-side (middleware
reads the runtime vars). **A manual deploy must pass `--var` overrides** — the
exact one-liner is in `sunday-suite/SundayTranslate-STATUS-RELAY-2026-08-08.md`
§1, which also lays out the lasting fix (commit the real issuer values; they are
public by design — the anon key is in every client bundle).

⚠️ **GitHub Actions cannot deploy.** `.github/workflows/deploy.yml` has **never**
succeeded: the repo is missing the `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` Actions secrets.
Manual wrangler deploy is the only working path until those are added.

```
set -a && source .env.production.local && set +a
npm run cf:build && npx opennextjs-cloudflare deploy   # + the --var overrides above
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # REQUIRED — host-start
npx wrangler secret put CF_REALTIME_APP_ID          # audio transport
npx wrangler secret put CF_REALTIME_APP_TOKEN
npx wrangler secret put TRANSLATE_ADMIN_EMAILS      # /host allowlist (fail-closed)
npx wrangler secret put ANTHROPIC_API_KEY           # phase 2 caption translation
# Secrets take effect immediately — no redeploy needed for a secret alone.
# verify: curl -s https://translate.sundaysuite.app/api/health
```

The local-relay broker needs five more secrets (`RELAY_ENROLL_TOKEN`,
`RELAY_WILDCARD_CERT_PEM`, `RELAY_WILDCARD_KEY_PEM`, `CF_DNS_TOKEN`,
`CF_ZONE_ID`) — documented in `.env.example`; with any of them missing the
enrol route answers 503 and the app is simply cloud-only.

`production-branch`/custom domain `translate.sundaysuite.app` is in
`wrangler.jsonc`. Verify against the live domain like the other suite apps.
Rollback: Cloudflare Dashboard → Workers → sundaytranslate → Deployments.

## Phase 2 / 3 — how they work (implemented)

- **AI captions**: `useCaptioner` records the source's published stream in ~5s
  self-contained webm/opus blobs → `POST /api/sessions/[id]/asr` → `lib/server/asr.ts`
  (Workers AI Whisper) → `lib/server/translate.ts` (Claude Haiku, one call per
  target) → `upsertCaption` + broadcast `events.caption` → listener `useCaptions`
  renders subtitles + late-join snapshot via `GET /captions`. Toggle on the kilde
  page; subtitle language picker on the listener (independent of the audio channel).
  **Unverified**: Whisper accepting webm/opus chunks (may need Deepgram Nova-3
  streaming or transcode); caption latency (~5s window + STT + MT).
- **AI synthetic voice**: `useTtsVoice` sends each new caption line to
  `POST /api/tts` → `lib/server/tts.ts` (Workers AI MeloTTS) → the listener
  queues + plays the audio. No server-side WebRTC. **Unverified + experimental**:
  per-line latency/choppiness; MeloTTS only covers a few languages; iOS autoplay
  of queued TTS (primed by the toggle gesture + AudioContext resume).

Both need the Workers AI binding (`ai` in `wrangler.jsonc`) and, for translation,
`ANTHROPIC_API_KEY` as a Worker secret. With neither, the app is exactly Phase 1.
Captions table: `supabase/migrations/20260613150000_translator_captions.sql`.

## Conventions

- Norwegian-first staff UI; the **listener** chrome is translated (`lib/locale.ts`,
  7 locales, RTL for Arabic). Dark-first, suite gold `#D4A73A` thread + this app's
  teal jewel tone `#2BB3C0`.
- No audio is recorded. Sessions self-expire after 24 h (lazy GC on create).
