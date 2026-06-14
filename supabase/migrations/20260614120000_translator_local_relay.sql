-- Local LAN relay support (plan: SundayTranslate lokal relay).
--
-- Additive + idempotent. The Cloudflare SFU fields (sessions/channels) are left
-- untouched; these new columns carry the OPTIONAL local (mediamtx WHIP/WHEP)
-- coordinates so a listener on the same wifi can pull audio from the church's
-- own relay instead of Cloudflare — free, low-latency, audio stays in the
-- building. Everything is no-op until a relay registers itself
-- (sessions.local_relay_url stays NULL → clients use the cloud path exactly as
-- today). 4G / no-relay listeners keep using Cloudflare.

alter table translator.sessions
  add column if not exists local_relay_url        text,
  add column if not exists local_relay_expires_at timestamptz;

-- The mediamtx stream path for this channel (listener builds the WHEP URL as
-- `<local_relay_url>/<local_stream>/whep`). `local_is_live` mirrors `is_live`
-- but for the local path, so a listener knows the relay actually has the track.
alter table translator.channels
  add column if not exists local_stream  text,
  add column if not exists local_is_live boolean not null default false;
