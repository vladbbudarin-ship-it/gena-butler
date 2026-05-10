alter table public.profiles
  add column if not exists telegram_user_id bigint unique,
  add column if not exists telegram_username text,
  add column if not exists telegram_link_code text unique,
  add column if not exists telegram_link_code_expires_at timestamptz,
  add column if not exists telegram_linked_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_telegram_link_code_format_check;

alter table public.profiles
  add constraint profiles_telegram_link_code_format_check
  check (
    telegram_link_code is null
    or telegram_link_code ~ '^TG-[0-9]{4}[A-Z]{2}$'
  );

create unique index if not exists profiles_telegram_user_id_key
  on public.profiles(telegram_user_id)
  where telegram_user_id is not null;

create unique index if not exists profiles_telegram_link_code_key
  on public.profiles(telegram_link_code)
  where telegram_link_code is not null;

create index if not exists profiles_telegram_link_code_expires_idx
  on public.profiles(telegram_link_code_expires_at);
