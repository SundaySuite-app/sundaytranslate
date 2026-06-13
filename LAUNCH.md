# SundayTranslate — Launch checklist

A single page separating what is **verified headless** (code/tests/CI, done in
this repo) from what **only Richard can do** (credentials, deploy, real-device
rig-test). The code for all three phases is complete and `npm run check` is green.

## ✅ Headless — done / verifiable without hardware

- [x] `npm run check` green (tsc + eslint + vitest). 33 unit tests cover the
      pure helpers (`lib/codes`, `lib/locales`) and the server seams
      (`lib/server/translate`, `asr`, `tts`) including every degrade-to-null
      fallback path.
- [x] CI gate: `.github/workflows/ci.yml` runs the same gate on every push/PR.
- [x] Phase-1/2/3 code complete; builds clean (`npm run build`).

## 🔑 Owner — credentials & deploy (Richard)

1. **Supabase migrations applied** to the shared project `rkiahljrkormwzogghpc`:
   - `supabase/migrations/20260613140000_translator_schema.sql`
   - `supabase/migrations/20260613150000_translator_captions.sql`
2. **Expose the schema** (the suite gotcha): Dashboard → Settings → API →
   Exposed schemas → add **`translator`** → Save.
3. **Secrets / `.env.production.local`** (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BASE_URL`
   - `CF_REALTIME_APP_ID`, `CF_REALTIME_APP_TOKEN` (Cloudflare Realtime app)
   - `ANTHROPIC_API_KEY` (Phase 2 captions — optional; no key → captions degrade,
     human interpretation unaffected)
4. **Deploy** (Cloudflare Worker, custom domain `translate.sundaysuite.app`):
   ```
   set -a && source .env.production.local && set +a
   npm run cf:build && npx opennextjs-cloudflare deploy
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put CF_REALTIME_APP_ID
   npx wrangler secret put CF_REALTIME_APP_TOKEN
   npx wrangler secret put ANTHROPIC_API_KEY   # optional
   ```
   Workers AI (`ai: { binding: "AI" }` in `wrangler.jsonc`) powers Phase 2/3 — no
   per-request secret, but the binding must be present on the deployed Worker.

## 🧪 Rig-test — needs real devices (the make-or-break items)

These could **not** be verified headless and must be confirmed on a real rig:

1. **Cloudflare Realtime SFU request/response shapes** (`lib/sfu.ts`,
   `app/api/rt/[...path]/route.ts`). Written against the documented Calls tracks
   API without live creds — confirm offer/answer/renegotiate shapes against a
   real Realtime app; adjust if they drift. May need **Cloudflare TURN** creds in
   the `ICE` config for listeners on cellular (host/srflx cover same-LAN only).
2. **iOS audio under screen-lock** — lock a real iPhone with earbuds in and
   confirm playback continues (`useSubscriber` + Wake Lock + MediaSession).
3. **Whisper accepts webm/opus chunks** — `lib/server/asr.ts` feeds the model the
   raw `MediaRecorder` blob. If `@cf/openai/whisper-large-v3-turbo` rejects the
   container, transcode or switch to Deepgram Nova-3 streaming.
4. **MeloTTS latency / choppiness** and per-line playback queueing on iOS
   (`lib/server/tts.ts`, `useTtsVoice`). Note: MeloTTS only covers
   en/es/fr/zh/ja/ko — other languages are **captions-only** by design.
5. **End-to-end flow at scale**: operator → kilde (sound desk) → tolk
   (interpreter) → many listeners. See the Phase-1 rig-test steps in `CLAUDE.md`.
