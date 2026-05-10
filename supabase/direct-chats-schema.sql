create or replace function public.generate_public_id()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');

    exit when not exists (
      select 1
      from public.profiles
      where public_id = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.profiles
  add column if not exists public_id text;

update public.profiles
set public_id = public.generate_public_id()
where public_id is null;

alter table public.profiles
  alter column public_id set default public.generate_public_id();

alter table public.profiles
  alter column public_id set not null;

alter table public.profiles
  drop constraint if exists profiles_public_id_format_check;

alter table public.profiles
  add constraint profiles_public_id_format_check
  check (public_id ~ '^[0-9]{10}$');

create unique index if not exists profiles_public_id_key
  on public.profiles(public_id);

create or replace function public.ensure_profile_public_id()
returns trigger
language plpgsql
as $$
begin
  if new.public_id is null then
    new.public_id := public.generate_public_id();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_public_id on public.profiles;
create trigger profiles_ensure_public_id
before insert or update on public.profiles
for each row
execute function public.ensure_profile_public_id();

alter table public.conversations
  add column if not exists type text not null default 'owner',
  add column if not exists direct_key text;

alter table public.conversations
  drop constraint if exists conversations_type_check;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('owner', 'direct'));

alter table public.conversations
  drop constraint if exists conversations_user_id_key;

create unique index if not exists conversations_owner_user_id_key
  on public.conversations(user_id)
  where type = 'owner';

create unique index if not exists conversations_direct_key_key
  on public.conversations(direct_key)
  where type = 'direct';

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants(user_id);

insert into public.conversation_participants (conversation_id, user_id, last_read_at)
select id, user_id, user_last_read_at
from public.conversations
where type = 'owner'
on conflict (conversation_id, user_id) do nothing;

drop policy if exists "Users select own conversations" on public.conversations;
create policy "Users select own conversations"
on public.conversations
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.conversation_participants
    where conversation_participants.conversation_id = conversations.id
      and conversation_participants.user_id = auth.uid()
  )
);

drop policy if exists "Users insert own conversations" on public.conversations;
create policy "Users insert own conversations"
on public.conversations
for insert
with check (
  (type = 'owner' and user_id = auth.uid())
  or (type = 'direct' and user_id = auth.uid())
);

drop policy if exists "Users update own conversations" on public.conversations;
create policy "Users update own conversations"
on public.conversations
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.conversation_participants
    where conversation_participants.conversation_id = conversations.id
      and conversation_participants.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.conversation_participants
    where conversation_participants.conversation_id = conversations.id
      and conversation_participants.user_id = auth.uid()
  )
);

alter table public.conversation_participants enable row level security;

drop policy if exists "Users select own conversation participants" on public.conversation_participants;
create policy "Users select own conversation participants"
on public.conversation_participants
for select
using (user_id = auth.uid() or public.is_owner_or_admin());

drop policy if exists "Users insert own conversation participants" on public.conversation_participants;
create policy "Users insert own conversation participants"
on public.conversation_participants
for insert
with check (
  user_id = auth.uid()
  or public.is_owner_or_admin()
);

drop policy if exists "Users update own conversation participants" on public.conversation_participants;
create policy "Users update own conversation participants"
on public.conversation_participants
for update
using (user_id = auth.uid() or public.is_owner_or_admin())
with check (user_id = auth.uid() or public.is_owner_or_admin());

drop policy if exists "Users select own chat messages" on public.chat_messages;
create policy "Users select own chat messages"
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = chat_messages.conversation_id
      and (
        conversations.user_id = auth.uid()
        or exists (
          select 1
          from public.conversation_participants
          where conversation_participants.conversation_id = conversations.id
            and conversation_participants.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Users insert own chat messages" on public.chat_messages;
create policy "Users insert own chat messages"
on public.chat_messages
for insert
with check (
  sender_id = auth.uid()
  and sender_role = 'user'
  and exists (
    select 1
    from public.conversations
    where conversations.id = chat_messages.conversation_id
      and (
        conversations.user_id = auth.uid()
        or exists (
          select 1
          from public.conversation_participants
          where conversation_participants.conversation_id = conversations.id
            and conversation_participants.user_id = auth.uid()
        )
      )
  )
);
