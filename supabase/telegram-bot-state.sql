create table if not exists public.telegram_bot_states (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  profile_id uuid references public.profiles(id) on delete cascade,
  state text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.telegram_bot_states
  drop constraint if exists telegram_bot_states_state_check;

alter table public.telegram_bot_states
  add constraint telegram_bot_states_state_check
  check (
    state in (
      'idle',
      'normal_dialog',
      'choosing_urgency',
      'waiting_urgent_question',
      'owner_waiting_edit_reply',
      'owner_waiting_manual_reply'
    )
  );

create index if not exists telegram_bot_states_profile_id_idx
  on public.telegram_bot_states(profile_id);

create index if not exists telegram_bot_states_expires_at_idx
  on public.telegram_bot_states(expires_at);

create or replace function public.touch_telegram_bot_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists telegram_bot_states_touch_updated_at on public.telegram_bot_states;
create trigger telegram_bot_states_touch_updated_at
before update on public.telegram_bot_states
for each row
execute function public.touch_telegram_bot_state();

alter table public.questions
  add column if not exists source_channel text not null default 'web',
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_message_id bigint;

alter table public.questions
  drop constraint if exists questions_source_channel_check;

alter table public.questions
  add constraint questions_source_channel_check
  check (source_channel in ('web', 'telegram'));

create index if not exists questions_source_channel_idx
  on public.questions(source_channel);

create index if not exists questions_telegram_chat_id_idx
  on public.questions(telegram_chat_id)
  where telegram_chat_id is not null;
