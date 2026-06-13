-- Phase 2 — live AI captions. One row per (session, locale) holding the latest
-- translated line, so a late-joining listener sees the current subtitle
-- immediately. The live stream itself rides Supabase broadcast (events.caption);
-- this table is just the catch-up snapshot.

create table if not exists translator.captions (
  session_id uuid not null references translator.sessions (id) on delete cascade,
  locale     text not null,
  seq        bigint not null default 0,
  text       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, locale)
);

grant all on translator.captions to service_role;
alter table translator.captions enable row level security;
-- No policies: anon/authenticated get zero direct access; all via service role.
