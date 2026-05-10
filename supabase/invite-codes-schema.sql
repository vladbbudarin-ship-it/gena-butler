create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  used_by uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  constraint invite_codes_code_format_check
    check (code ~ '^[0-9]{4}[A-Z]{2}$'),
  constraint invite_codes_status_check
    check (status in ('active', 'used', 'expired'))
);

create index if not exists invite_codes_code_idx
  on public.invite_codes(code);

create index if not exists invite_codes_created_by_idx
  on public.invite_codes(created_by);

create index if not exists invite_codes_used_by_idx
  on public.invite_codes(used_by);

alter table public.invite_codes enable row level security;

grant select on public.invite_codes to authenticated;
revoke insert, update, delete on public.invite_codes from anon, authenticated;

drop policy if exists "Users select own invite codes" on public.invite_codes;
create policy "Users select own invite codes"
on public.invite_codes
for select
using (created_by = auth.uid());

drop policy if exists "Users cannot insert invite codes directly" on public.invite_codes;

drop policy if exists "Users cannot update invite codes directly" on public.invite_codes;
