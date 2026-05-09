alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'owner', 'admin'));

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open',
  owner_last_read_at timestamptz,
  user_last_read_at timestamptz,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint conversations_user_id_key unique (user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'owner', 'ai')),
  body text not null,
  body_zh text,
  importance text not null default 'normal' check (importance in ('normal', 'important', 'urgent')),
  source_question_id uuid references public.questions(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists conversations_last_message_at_idx on public.conversations(last_message_at desc);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at);
create index if not exists chat_messages_importance_idx on public.chat_messages(importance);
create unique index if not exists chat_messages_question_user_msg_key
  on public.chat_messages(source_question_id, sender_role)
  where source_question_id is not null and sender_role in ('user', 'owner');

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists chat_messages_touch_conversation on public.chat_messages;
create trigger chat_messages_touch_conversation
after insert on public.chat_messages
for each row
execute function public.touch_conversation_after_message();

alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users select own conversations" on public.conversations;
create policy "Users select own conversations"
on public.conversations
for select
using (user_id = auth.uid());

drop policy if exists "Owners select all conversations" on public.conversations;
create policy "Owners select all conversations"
on public.conversations
for select
using (public.is_owner_or_admin());

drop policy if exists "Users insert own conversations" on public.conversations;
create policy "Users insert own conversations"
on public.conversations
for insert
with check (user_id = auth.uid());

drop policy if exists "Owners update all conversations" on public.conversations;
create policy "Owners update all conversations"
on public.conversations
for update
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "Users update own conversations" on public.conversations;
create policy "Users update own conversations"
on public.conversations
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users select own chat messages" on public.chat_messages;
create policy "Users select own chat messages"
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = chat_messages.conversation_id
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists "Owners select all chat messages" on public.chat_messages;
create policy "Owners select all chat messages"
on public.chat_messages
for select
using (public.is_owner_or_admin());

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
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists "Owners insert owner chat messages" on public.chat_messages;
create policy "Owners insert owner chat messages"
on public.chat_messages
for insert
with check (
  sender_role = 'owner'
  and importance = 'normal'
  and public.is_owner_or_admin()
);

insert into public.conversations (user_id, last_message_at, created_at, updated_at)
select
  questions.user_id,
  max(coalesce(questions.closed_at, questions.created_at)),
  min(questions.created_at),
  now()
from public.questions
group by questions.user_id
on conflict (user_id) do update
set last_message_at = greatest(public.conversations.last_message_at, excluded.last_message_at),
    updated_at = now();

insert into public.chat_messages (
  conversation_id,
  sender_id,
  sender_role,
  body,
  importance,
  source_question_id,
  created_at
)
select
  conversations.id,
  questions.user_id,
  'user',
  questions.question_text,
  questions.urgency_level,
  questions.id,
  questions.created_at
from public.questions
join public.conversations on conversations.user_id = questions.user_id
where questions.question_text is not null
on conflict do nothing;

insert into public.chat_messages (
  conversation_id,
  sender_id,
  sender_role,
  body,
  body_zh,
  importance,
  source_question_id,
  created_at
)
select
  conversations.id,
  null,
  'owner',
  questions.final_answer_ru,
  questions.final_answer_zh,
  'normal',
  questions.id,
  coalesce(questions.closed_at, questions.created_at)
from public.questions
join public.conversations on conversations.user_id = questions.user_id
where questions.final_answer_ru is not null
on conflict do nothing;
