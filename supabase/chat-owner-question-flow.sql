alter table public.conversations
  add column if not exists type text not null default 'owner';

update public.conversations
set type = 'owner'
where type is null;

alter table public.conversations
  alter column type set default 'direct';

alter table public.conversations
  drop constraint if exists conversations_type_check;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('owner', 'direct'));

alter table public.questions
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists source_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists final_message_id uuid references public.chat_messages(id) on delete set null;

create index if not exists questions_conversation_id_idx
  on public.questions(conversation_id);

create index if not exists questions_source_message_id_idx
  on public.questions(source_message_id);

create index if not exists questions_final_message_id_idx
  on public.questions(final_message_id);

update public.questions as questions
set
  conversation_id = coalesce(questions.conversation_id, chat_messages.conversation_id),
  source_message_id = coalesce(questions.source_message_id, chat_messages.id)
from public.chat_messages
where chat_messages.source_question_id = questions.id
  and chat_messages.sender_role = 'user';

update public.questions as questions
set
  final_message_id = coalesce(questions.final_message_id, chat_messages.id)
from public.chat_messages
where chat_messages.source_question_id = questions.id
  and chat_messages.sender_role = 'owner';
