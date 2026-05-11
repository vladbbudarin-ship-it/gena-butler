alter table public.chat_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists chat_messages_deleted_at_idx
  on public.chat_messages(conversation_id, deleted_at);

create index if not exists chat_messages_deleted_by_idx
  on public.chat_messages(deleted_by);
