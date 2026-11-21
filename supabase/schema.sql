-- GUESS THE WORD — Supabase PostgreSQL Schema, Constraints, Indexes & RLS Policies

create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(6) not null unique,
  host_player_id uuid,
  max_players integer not null check (max_players between 2 and 6),
  room_status text not null default 'WAITING' check (room_status in ('WAITING', 'PLAYING', 'REVEAL', 'FINISHED')),
  current_round integer not null default 1 check (current_round >= 1),
  round_result text check (round_result in ('MATCH', 'MISMATCH') or round_result is null),
  reveal_ends_at timestamptz,
  winning_word text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  connection_status text not null default 'connected' check (connection_status in ('connected', 'disconnected'))
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  submitted_word text not null,
  normalized_word text not null,
  submitted_at timestamptz not null default now(),
  unique (room_id, player_id, round_number)
);

create unique index if not exists idx_rooms_room_code on public.rooms(room_code);
create index if not exists idx_players_room_joined on public.players(room_id, joined_at);
create index if not exists idx_players_auth_user on public.players(auth_user_id);
create index if not exists idx_submissions_room_round on public.submissions(room_id, round_number);

-- Enable Row Level Security
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.submissions enable row level security;

-- Helper function: verify current authenticated user is a member of the room
create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.players p
    where p.room_id = target_room_id
      and p.auth_user_id = auth.uid()
  );
$$;

-- Rooms: only members of the room can read room state; mutations go through Edge Functions (service role)
create policy "Room members can view their room"
  on public.rooms for select
  using (public.is_room_member(id));

-- Players: only room members can view players in their room
create policy "Room members can view players in their room"
  on public.players for select
  using (public.is_room_member(room_id));

-- Submissions: CRITICAL privacy policy
-- Players can NEVER read other players' words while room_status is 'PLAYING'.
-- Words become readable only once the server sets room_status to 'REVEAL' or 'FINISHED'.
create policy "Submissions visible only on REVEAL or FINISHED"
  on public.submissions for select
  using (
    public.is_room_member(room_id)
    and exists (
      select 1
      from public.rooms r
      where r.id = submissions.room_id
        and r.room_status in ('REVEAL', 'FINISHED')
        and r.current_round = submissions.round_number
    )
  );

-- Enable Realtime publications for rooms & players (not raw submissions during PLAYING)
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
