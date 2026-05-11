alter table public.questions
  add column if not exists ai_reply_options jsonb,
  add column if not exists ai_suggested_status text;

alter table public.questions
  drop constraint if exists questions_ai_suggested_status_check;

alter table public.questions
  add constraint questions_ai_suggested_status_check
  check (
    ai_suggested_status is null
    or ai_suggested_status in ('answer', 'clarify', 'ignore', 'urgent_review')
  );

create index if not exists questions_ai_suggested_status_idx
  on public.questions(ai_suggested_status);
