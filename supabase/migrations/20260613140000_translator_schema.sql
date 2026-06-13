-- SundayTranslate — `translator` schema on the shared "Sunday" Supabase
-- project (rkiahljrkormwzogghpc; SundayPlan owns `public`, SundayInfo `info`,
-- SundayStage `stage`). Timestamp-prefixed migration per the shared-project rule.
--
-- AFTER applying: Dashboard → Settings → API → Exposed schemas → add
-- `translator` → Save, or PostgREST will not route translator.* calls.
--
-- Security model (the suite pattern): RLS deny-all, every read/write goes
-- through server API routes with the service role. Supabase Realtime *broadcast*
-- (the live channel list / "who is speaking" / captions) is a pure message bus
-- and needs no table grants.

create schema if not exists translator;

-- ── sessions ──────────────────────────────────────────────────────────────
-- One live session = one church service. Reached by a 6-digit PIN. `secret` is
-- the bearer that authorises operator/source/interpreter writes; returned once.
create table if not exists translator.sessions (
  id            uuid primary key default gen_random_uuid(),
  pin           text not null,
  title         text not null default '',
  source_locale text not null default 'no',  -- spoken language in the room
  status        text not null default 'live' check (status in ('live', 'ended')),
  secret        text not null,
  church_id     uuid,                          -- optional SSO provenance
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);

-- PIN is unique only among live sessions, so it can be recycled after a service.
create unique index if not exists sessions_active_pin_uq
  on translator.sessions (pin) where status = 'live';
create index if not exists sessions_expires_idx on translator.sessions (expires_at);

-- ── channels ──────────────────────────────────────────────────────────────
-- An audio feed a listener can tune into: the original room audio (assistive
-- listening for the hard-of-hearing), a human interpreter's language, or
-- (phase 3) a synthetic AI voice. The SFU coordinates let a listener pull the
-- publisher's track from Cloudflare Realtime.
create table if not exists translator.channels (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references translator.sessions (id) on delete cascade,
  kind           text not null check (kind in ('original', 'human', 'ai')),
  source_locale  text not null default 'no',
  target_locale  text,                          -- null for 'original'
  label          text not null default '',
  sfu_session_id text,                          -- publisher's Cloudflare Realtime session id
  track_name     text,                          -- the published track name
  is_live        boolean not null default false,
  updated_at     timestamptz not null default now()
);

create index if not exists channels_session_idx on translator.channels (session_id);
create unique index if not exists channels_session_lang_uq
  on translator.channels (session_id, kind, coalesce(target_locale, '-'));

-- ── RPCs (SECURITY DEFINER) ────────────────────────────────────────────────
-- Atomic PIN allocation + secret minting. Lazily GC expired sessions so PINs
-- free up without a cron.
create or replace function translator.create_session(
  p_title text,
  p_source_locale text,
  p_church_id uuid default null
) returns table (id uuid, pin text, secret text)
language plpgsql security definer set search_path = translator, public as $$
declare
  v_pin    text;
  v_secret text := replace(gen_random_uuid()::text, '-', '')
                || replace(gen_random_uuid()::text, '-', '');
  v_id     uuid;
  i        int := 0;
begin
  delete from translator.sessions where expires_at < now();
  loop
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into translator.sessions (pin, title, source_locale, secret, church_id)
      values (v_pin, coalesce(p_title, ''), coalesce(p_source_locale, 'no'),
              v_secret, p_church_id)
      returning translator.sessions.id into v_id;
      exit;
    exception when unique_violation then
      i := i + 1;
      if i > 50 then raise exception 'could not allocate a unique pin'; end if;
    end;
  end loop;
  return query select v_id, v_pin, v_secret;
end $$;

-- Resolve a PIN to a live session. Never leaks the secret.
create or replace function translator.session_by_pin(p_pin text)
returns table (id uuid, title text, source_locale text, status text)
language sql security definer set search_path = translator, public as $$
  select s.id, s.title, s.source_locale, s.status
  from translator.sessions s
  where s.pin = p_pin and s.status = 'live'
  limit 1;
$$;

-- ── grants + RLS ───────────────────────────────────────────────────────────
grant usage on schema translator to anon, authenticated, service_role;
grant all on all tables in schema translator to service_role;
alter default privileges in schema translator grant all on tables to service_role;

-- SECURITY DEFINER functions must NOT be callable by the anon/authenticated
-- PostgREST roles — only the server (service role) invokes them.
revoke execute on all functions in schema translator from public, anon, authenticated;
grant execute on all functions in schema translator to service_role;

alter table translator.sessions enable row level security;
alter table translator.channels enable row level security;
-- No policies on purpose: anon/authenticated get zero direct table access;
-- everything flows through the service-role API routes.
