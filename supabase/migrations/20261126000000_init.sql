-- Snake & Ladder Promo - initial schema
-- All game actions go through the Next.js API (service role). Browsers never
-- read tables directly: RLS is enabled everywhere with NO anon/authenticated
-- policies, so participant data and player tokens cannot be read with the anon key.
-- Realtime uses Broadcast channels ("room:<CODE>") sent by the server, not table changes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- campaigns
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name           text not null,
  business_name  text not null default '',
  status         text not null default 'draft' check (status in ('draft','active','archived')),
  starts_at      timestamptz,
  ends_at        timestamptz,
  branding       jsonb not null default '{}'::jsonb,
  content        jsonb not null default '{}'::jsonb,
  game_config    jsonb not null default '{}'::jsonb,
  registration   jsonb not null default '{}'::jsonb,
  ctas           jsonb not null default '[]'::jsonb,
  milestones     jsonb not null default '[]'::jsonb,
  coupon         jsonb not null default '{}'::jsonb,
  retention_days integer not null default 180 check (retention_days between 1 and 3650),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists campaigns_status_idx on public.campaigns (status, created_at desc);

-- ---------------------------------------------------------------- rooms
create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  status          text not null default 'lobby' check (status in ('lobby','playing','paused','finished')),
  hosted_by_admin boolean not null default false,
  games_played    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists rooms_campaign_idx on public.rooms (campaign_id, created_at desc);

-- ---------------------------------------------------------------- game state
-- One row per room; the JSON "state" is the authoritative live game state.
-- Every write is a compare-and-swap on "version" which prevents duplicate
-- draws / double starts even when many clients hit the server at once.
create table if not exists public.game_states (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  version    integer not null default 0,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- participants (marketing registrations)
create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  device_id         text,
  name              text,
  email             text,
  phone             text,
  extra             jsonb not null default '{}'::jsonb,
  marketing_consent boolean not null default false,
  created_at        timestamptz not null default now(),
  anonymized_at     timestamptz
);
create index if not exists participants_campaign_idx on public.participants (campaign_id, created_at desc);
create index if not exists participants_device_idx on public.participants (campaign_id, device_id);

-- ---------------------------------------------------------------- players (one per room seat)
create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  nickname       text not null check (char_length(nickname) between 1 and 20),
  avatar         text not null default '',
  color          text not null default '#000000',
  token_hash     text not null,
  device_id      text,
  last_seen_at   timestamptz not null default now(),
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  final_position integer,
  final_rank     integer
);
create index if not exists players_room_idx on public.players (room_id);
create index if not exists players_campaign_idx on public.players (campaign_id);
create index if not exists players_token_idx on public.players (token_hash);

-- ---------------------------------------------------------------- consent log (append-only audit trail)
create table if not exists public.marketing_consents (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  consented      boolean not null,
  consent_text   text not null,
  user_agent     text,
  created_at     timestamptz not null default now()
);
create index if not exists consents_campaign_idx on public.marketing_consents (campaign_id, created_at desc);

-- ---------------------------------------------------------------- game logs
create table if not exists public.game_logs (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  player_id  uuid references public.players(id) on delete set null,
  type       text not null,
  message    text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists game_logs_room_idx on public.game_logs (room_id, id desc);

-- ---------------------------------------------------------------- winners
create table if not exists public.winners (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  room_code      text not null,
  round          integer not null default 1,
  player_id      uuid not null references public.players(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  nickname       text not null,
  rank           integer not null,
  prize          text not null default '',
  coupon_code    text unique,
  created_at     timestamptz not null default now(),
  unique (room_id, round, player_id)
);
create index if not exists winners_campaign_idx on public.winners (campaign_id, created_at desc);

-- ---------------------------------------------------------------- CTA click tracking
create table if not exists public.cta_clicks (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete set null,
  player_id   uuid references public.players(id) on delete set null,
  cta_id      text not null,
  url         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists cta_clicks_campaign_idx on public.cta_clicks (campaign_id, created_at desc);

-- ---------------------------------------------------------------- updated_at triggers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();
drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();
drop trigger if exists game_states_touch on public.game_states;
create trigger game_states_touch before update on public.game_states
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- Row Level Security
-- Enabled on every table with no policies for anon/authenticated = deny all.
-- The server uses the service-role key, which bypasses RLS.
alter table public.campaigns          enable row level security;
alter table public.rooms              enable row level security;
alter table public.game_states        enable row level security;
alter table public.participants       enable row level security;
alter table public.players            enable row level security;
alter table public.marketing_consents enable row level security;
alter table public.game_logs          enable row level security;
alter table public.winners            enable row level security;
alter table public.cta_clicks         enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------- data retention
-- Anonymises participant PII older than each campaign's retention_days.
-- Schedule with pg_cron:  select cron.schedule('purge-pii', '0 3 * * *', $$select public.purge_expired_participant_data()$$);
create or replace function public.purge_expired_participant_data() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.participants p
     set name = null, email = null, phone = null, extra = '{}'::jsonb, device_id = null,
         anonymized_at = now()
    from public.campaigns c
   where p.campaign_id = c.id
     and p.anonymized_at is null
     and p.created_at < now() - make_interval(days => c.retention_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_participant_data() from public, anon, authenticated;
