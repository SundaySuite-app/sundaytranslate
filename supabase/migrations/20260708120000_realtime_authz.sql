-- 20260708120000 — Realtime Authorization for the translator:session:* broadcast topic.
--
-- Today the session channel (translator:session:<id>) is a PUBLIC broadcast
-- topic: anyone who learns the session UUID (surfaced to every listener/staff
-- page once they join by PIN) can subscribe AND .send() forged broadcast
-- events on it — e.g. a fake `caption` event putting bogus AI-subtitle text on
-- the storskjerm, or a fake `session`/`channels` event. lib/client/useCaptions.ts
-- and useLiveChannels.ts render whatever arrives with no server round-trip, so a
-- forged event is indistinguishable from a real one until the next refetch.
-- No data corruption (the DB itself is untouched — broadcast is a pure hint
-- layer and every client refetches authoritative state on reconnect/refetch),
-- but it is a real spoofing hole.
--
-- Fix: the client marks the channel `private: true`
-- (lib/client/useChannel.ts), which makes Realtime authorize every subscriber
-- against RLS on realtime.messages. This policy lets anon + authenticated
-- RECEIVE (SELECT) on translator:session:* topics but grants NO client INSERT
-- → a forged client .send() is denied by default-deny RLS. Server publish is
-- unaffected: lib/server/broadcast.ts posts via the REST
-- /realtime/v1/api/broadcast endpoint using the service_role key, which
-- bypasses RLS entirely.
--
-- There is only the one channel pattern in this app (lib/realtime.ts
-- `channels.session`) — unlike sibling apps with a split public/private
-- channel set, everything on this topic goes private here.
--
-- realtime.messages is a Supabase-managed object absent from a vanilla
-- postgres test harness, so the policy is guarded on its presence and is a
-- clean no-op there. Idempotent / safe to re-run.

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages absent (test harness) — skipping Realtime RLS policy';
    return;
  end if;

  -- RECEIVE: a private-channel subscriber reads realtime.messages for its
  -- topic. realtime.topic() returns the topic being authorized; the %
  -- wildcard covers translator:session:<id> for every live session.
  execute 'drop policy if exists "translator_session_receive" on realtime.messages';
  execute $p$
    create policy "translator_session_receive"
      on realtime.messages
      for select
      to anon, authenticated
      using ( realtime.topic() like 'translator:session:%' )
  $p$;

  -- NO insert/update/delete policy for anon/authenticated → client broadcasts
  -- (forged captions/lifecycle events) are denied by default-deny RLS. Server
  -- publish bypasses RLS via service_role.
end $$;
