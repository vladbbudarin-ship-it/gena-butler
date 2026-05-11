-- User+ invite codes for "Дворецкий Гена".
-- Run in Supabase SQL Editor. Do not execute from frontend.

alter table public.profiles
  add column if not exists account_type text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('user', 'user_plus', 'owner'));

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'user_plus', 'owner', 'admin'));

update public.profiles
set account_type = case
  when role in ('owner', 'admin') then 'owner'
  when role = 'user_plus' then 'user_plus'
  else 'user'
end
where account_type is null or account_type = 'user';

create table if not exists public.plus_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  used_by uuid references auth.users(id) on delete set null,
  is_used boolean not null default false,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint plus_invite_codes_code_format_check
    check (code ~ '^Plus[0-9]{4}[A-Z]{2}$')
);

create index if not exists plus_invite_codes_code_idx
  on public.plus_invite_codes(code);

create index if not exists plus_invite_codes_created_by_idx
  on public.plus_invite_codes(created_by);

create index if not exists plus_invite_codes_used_by_idx
  on public.plus_invite_codes(used_by);

create or replace function public.account_type_rank(account_type_value text)
returns integer
language sql
immutable
as $$
  select case account_type_value
    when 'owner' then 3
    when 'user_plus' then 2
    else 1
  end
$$;

create or replace function public.current_account_type(target_user uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case
      when account_type = 'owner' or role in ('owner', 'admin') then 'owner'
      when account_type = 'user_plus' or role = 'user_plus' then 'user_plus'
      else 'user'
    end
    from public.profiles
    where id = target_user
  ), 'user')
$$;

create or replace function public.is_system_owner(target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_account_type(target_user) = 'owner'
$$;

alter table public.plus_invite_codes enable row level security;

drop policy if exists "Owners read plus codes" on public.plus_invite_codes;
create policy "Owners read plus codes"
on public.plus_invite_codes
for select
using (public.is_system_owner());

drop policy if exists "No frontend insert plus codes" on public.plus_invite_codes;
create policy "No frontend insert plus codes"
on public.plus_invite_codes
for insert
with check (false);

drop policy if exists "No frontend update plus codes" on public.plus_invite_codes;
create policy "No frontend update plus codes"
on public.plus_invite_codes
for update
using (false)
with check (false);

drop policy if exists "No frontend delete plus codes" on public.plus_invite_codes;
create policy "No frontend delete plus codes"
on public.plus_invite_codes
for delete
using (false);

-- Optional hardening if RLS is enabled on profiles in your project:
-- ordinary users should not be able to promote themselves.
drop policy if exists "Users cannot self promote account type" on public.profiles;
create policy "Users cannot self promote account type"
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and public.account_type_rank(account_type) <= public.account_type_rank(public.current_account_type(auth.uid()))
);

create or replace function public.prevent_account_type_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() = new.id
    and public.account_type_rank(new.account_type) > public.account_type_rank(old.account_type) then
    raise exception 'Users cannot promote their own account_type';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_account_type_self_escalation on public.profiles;
create trigger profiles_prevent_account_type_self_escalation
before update of account_type on public.profiles
for each row
execute function public.prevent_account_type_self_escalation();
