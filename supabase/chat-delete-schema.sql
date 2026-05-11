alter table public.conversation_participants
  add column if not exists deleted_at timestamptz;

alter table public.conversations
  add column if not exists owner_hidden_at timestamptz;

create index if not exists conversation_participants_deleted_at_idx
  on public.conversation_participants(user_id, deleted_at);

create index if not exists conversations_owner_hidden_at_idx
  on public.conversations(type, owner_hidden_at);
