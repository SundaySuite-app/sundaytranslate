-- SundayTranslate — OPTIONAL host/operatør ownership for the my-oversettelses-
-- sesjons dashboard (Sunday Account login).
--
-- Additive + idempotent. A nullable `host_user_id` records WHICH Sunday Account
-- (issuer auth user id) started a session, so a signed-in host can list / open
-- / delete their own sessions. It stays NULL for anonymous starts — the
-- code-based operator/source/interpreter/listener flow is completely unchanged
-- and never depends on this column.
--
-- The id references the ISSUER auth project's users, which lives in a DIFFERENT
-- Supabase project than this DATA schema, so there is intentionally NO foreign
-- key here — we only store the uuid for owner-scoped queries.

alter table translator.sessions
  add column if not exists host_user_id uuid;

-- Owner-scoped dashboard list: "my sessions, newest first".
create index if not exists sessions_host_user_idx
  on translator.sessions (host_user_id, created_at desc)
  where host_user_id is not null;

-- ── owner-aware RPC ─────────────────────────────────────────────────────────
-- Best-effort owner stamping at create time. Mirrors the existing
-- create_session signature but takes an optional host_user_id. Anonymous create
-- passes NULL → identical behaviour to before. Kept SECURITY DEFINER and
-- service-role-only like its sibling.
create or replace function translator.create_session_owned(
  p_title text,
  p_source_locale text,
  p_host_user_id uuid default null,
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
      insert into translator.sessions
        (pin, title, source_locale, secret, church_id, host_user_id)
      values (v_pin, coalesce(p_title, ''), coalesce(p_source_locale, 'no'),
              v_secret, p_church_id, p_host_user_id)
      returning translator.sessions.id into v_id;
      exit;
    exception when unique_violation then
      i := i + 1;
      if i > 50 then raise exception 'could not allocate a unique pin'; end if;
    end;
  end loop;
  return query select v_id, v_pin, v_secret;
end $$;

-- Same lock-down as the rest of the schema: only the service role may call it.
revoke execute on function
  translator.create_session_owned(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  translator.create_session_owned(text, text, uuid, uuid)
  to service_role;
