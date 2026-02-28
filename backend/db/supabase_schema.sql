create extension if not exists "pgcrypto";

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  deal_room_id text,
  title text not null default 'Chat Session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_wallet_idx
  on public.chat_sessions (wallet_address, updated_at desc);
create unique index if not exists chat_sessions_deal_room_unique_idx
  on public.chat_sessions (deal_room_id)
  where deal_room_id is not null;

create table if not exists public.chat_session_participants (
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  wallet_address text not null,
  role text,
  joined_at timestamptz not null default now(),
  primary key (session_id, wallet_address)
);

create index if not exists chat_session_participants_wallet_idx
  on public.chat_session_participants (wallet_address, joined_at desc);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  wallet_address text not null,
  role text not null check (role in ('user', 'assistant', 'system', 'founder', 'investor', 'agent', 'buyer_agent', 'seller_agent')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on public.chat_messages (session_id, created_at asc);

create index if not exists chat_messages_wallet_idx
  on public.chat_messages (wallet_address, created_at desc);

-- Enable real-time publication for chat_messages
-- This allows frontend clients to subscribe via listen()
begin;
  -- supabase_realtime publication may already exist, so we simply add to it
  alter publication supabase_realtime add table public.chat_messages;
commit;

alter table public.chat_sessions enable row level security;
alter table public.chat_session_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "service_role_full_chat_sessions" on public.chat_sessions;
create policy "service_role_full_chat_sessions"
  on public.chat_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_full_chat_messages" on public.chat_messages;
create policy "service_role_full_chat_messages"
  on public.chat_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Enable read access for anonymous users so Realtime WebSockets can broadcast new messages.
-- Without this, Supabase RLS silently blocks the real-time events for unauthenticated frontends.
drop policy if exists "anon_select_chat_messages" on public.chat_messages;
create policy "anon_select_chat_messages"
  on public.chat_messages
  for select
  using (true);

drop policy if exists "service_role_full_chat_session_participants" on public.chat_session_participants;
create policy "service_role_full_chat_session_participants"
  on public.chat_session_participants
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── Deal Rooms ──────────────────────────────────────────────────────

create table if not exists public.deal_rooms (
  room_id         text primary key,
  session_id      text,
  status          text not null default 'created',
  seller_address  text not null,
  seller_threshold numeric not null default 0,
  buyer_address   text not null default '',
  buyer_budget    numeric not null default 0,
  proposed_price  numeric not null default 0,
  documents_ingested boolean not null default false,
  tx_history      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  settled_at      timestamptz
);

create index if not exists deal_rooms_seller_idx
  on public.deal_rooms (seller_address, created_at desc);
create index if not exists deal_rooms_buyer_idx
  on public.deal_rooms (buyer_address, created_at desc);

alter table public.deal_rooms enable row level security;

drop policy if exists "service_role_full_deal_rooms" on public.deal_rooms;
create policy "service_role_full_deal_rooms"
  on public.deal_rooms
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
