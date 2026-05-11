-- Project management module for "Дворецкий Гена".
-- Run this file in Supabase SQL Editor. Do not put secrets here.

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

create table if not exists public.sup_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'archived')),
  ai_context text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sup_project_members (
  project_id uuid not null references public.sup_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position_title text,
  access_level text not null default 'member' check (access_level in ('admin', 'manager', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.sup_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sup_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'needs_changes', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  visibility text not null default 'project_public' check (visibility in ('project_public', 'assigned_only', 'custom')),
  created_by uuid not null references auth.users(id) on delete cascade,
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sup_task_visible_members (
  task_id uuid not null references public.sup_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists public.sup_task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.sup_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sup_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.sup_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sup_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sup_projects(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.sup_task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.sup_tasks(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.sup_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.sup_projects(id) on delete cascade,
  task_id uuid references public.sup_tasks(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete set null,
  prompt text not null,
  suggestion text not null,
  created_at timestamptz not null default now(),
  check (project_id is not null or task_id is not null)
);

create index if not exists sup_project_members_user_idx on public.sup_project_members(user_id);
create index if not exists sup_tasks_project_idx on public.sup_tasks(project_id);
create index if not exists sup_tasks_assignee_idx on public.sup_tasks(assignee_id);
create index if not exists sup_task_visible_members_user_idx on public.sup_task_visible_members(user_id);
create index if not exists sup_task_updates_task_idx on public.sup_task_updates(task_id, created_at);
create index if not exists sup_task_comments_task_idx on public.sup_task_comments(task_id, created_at);
create index if not exists sup_project_files_project_idx on public.sup_project_files(project_id);
create index if not exists sup_task_files_task_idx on public.sup_task_files(task_id);
create index if not exists sup_ai_suggestions_project_idx on public.sup_ai_suggestions(project_id, created_at);
create index if not exists sup_ai_suggestions_task_idx on public.sup_ai_suggestions(task_id, created_at);

create or replace function public.sup_account_role(target_user uuid default auth.uid())
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

create or replace function public.sup_is_owner(target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.sup_account_role(target_user) = 'owner'
$$;

create or replace function public.sup_can_create_project(target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.sup_account_role(target_user) in ('user_plus', 'owner')
$$;

create or replace function public.sup_is_project_member(target_project uuid, target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.sup_project_members
    where project_id = target_project and user_id = target_user
  ) or public.sup_is_owner(target_user)
$$;

create or replace function public.sup_project_access_level(target_project uuid, target_user uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.sup_is_owner(target_user) then 'admin'
    else coalesce((
      select access_level from public.sup_project_members
      where project_id = target_project and user_id = target_user
    ), 'none')
  end
$$;

create or replace function public.sup_can_manage_project(target_project uuid, target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.sup_project_access_level(target_project, target_user) = 'admin'
$$;

create or replace function public.sup_can_manage_tasks(target_project uuid, target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.sup_can_create_project(target_user)
    and public.sup_project_access_level(target_project, target_user) in ('admin', 'manager')
$$;

create or replace function public.sup_can_view_task(target_task uuid, target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.sup_tasks t
    where t.id = target_task
      and public.sup_is_project_member(t.project_id, target_user)
      and (
        t.visibility = 'project_public'
        or public.sup_project_access_level(t.project_id, target_user) in ('admin', 'manager')
        or t.created_by = target_user
        or t.assignee_id = target_user
        or exists (
          select 1 from public.sup_task_visible_members tv
          where tv.task_id = t.id and tv.user_id = target_user
        )
      )
  )
$$;

create or replace function public.sup_can_review_task(target_task uuid, target_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.sup_tasks t
    where t.id = target_task
      and (
        t.created_by = target_user
        or public.sup_project_access_level(t.project_id, target_user) in ('admin', 'manager')
      )
  )
$$;

alter table public.sup_projects enable row level security;
alter table public.sup_project_members enable row level security;
alter table public.sup_tasks enable row level security;
alter table public.sup_task_visible_members enable row level security;
alter table public.sup_task_updates enable row level security;
alter table public.sup_task_comments enable row level security;
alter table public.sup_project_files enable row level security;
alter table public.sup_task_files enable row level security;
alter table public.sup_ai_suggestions enable row level security;

drop policy if exists "Project members can read projects" on public.sup_projects;
create policy "Project members can read projects" on public.sup_projects
for select using (public.sup_is_project_member(id));

drop policy if exists "Plus users can create projects" on public.sup_projects;
create policy "Plus users can create projects" on public.sup_projects
for insert with check (created_by = auth.uid() and public.sup_can_create_project());

drop policy if exists "Project admins can update projects" on public.sup_projects;
create policy "Project admins can update projects" on public.sup_projects
for update using (public.sup_can_manage_project(id))
with check (public.sup_can_manage_project(id));

drop policy if exists "Project members can read members" on public.sup_project_members;
create policy "Project members can read members" on public.sup_project_members
for select using (public.sup_is_project_member(project_id));

drop policy if exists "Project admins manage members" on public.sup_project_members;
create policy "Project admins manage members" on public.sup_project_members
for all using (public.sup_can_manage_project(project_id))
with check (public.sup_can_manage_project(project_id));

drop policy if exists "Creators add themselves as project admin" on public.sup_project_members;
create policy "Creators add themselves as project admin" on public.sup_project_members
for insert with check (
  user_id = auth.uid()
  and access_level = 'admin'
  and exists (
    select 1 from public.sup_projects p
    where p.id = project_id and p.created_by = auth.uid()
  )
);

drop policy if exists "Users can read visible tasks" on public.sup_tasks;
create policy "Users can read visible tasks" on public.sup_tasks
for select using (public.sup_can_view_task(id));

drop policy if exists "Managers can create tasks" on public.sup_tasks;
create policy "Managers can create tasks" on public.sup_tasks
for insert with check (
  created_by = auth.uid()
  and public.sup_can_manage_tasks(project_id)
);

drop policy if exists "Managers and assignees can update tasks" on public.sup_tasks;
create policy "Managers and assignees can update tasks" on public.sup_tasks
for update using (
  public.sup_can_manage_tasks(project_id)
  or assignee_id = auth.uid()
  or created_by = auth.uid()
)
with check (
  public.sup_can_manage_tasks(project_id)
  or assignee_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "Visible task members can read custom access" on public.sup_task_visible_members;
create policy "Visible task members can read custom access" on public.sup_task_visible_members
for select using (public.sup_can_view_task(task_id));

drop policy if exists "Managers can manage custom task access" on public.sup_task_visible_members;
create policy "Managers can manage custom task access" on public.sup_task_visible_members
for all using (
  exists (select 1 from public.sup_tasks t where t.id = task_id and public.sup_can_manage_tasks(t.project_id))
)
with check (
  exists (select 1 from public.sup_tasks t where t.id = task_id and public.sup_can_manage_tasks(t.project_id))
);

drop policy if exists "Visible task users read updates" on public.sup_task_updates;
create policy "Visible task users read updates" on public.sup_task_updates
for select using (public.sup_can_view_task(task_id));

drop policy if exists "Visible task users add updates" on public.sup_task_updates;
create policy "Visible task users add updates" on public.sup_task_updates
for insert with check (user_id = auth.uid() and public.sup_can_view_task(task_id));

drop policy if exists "Visible task users read comments" on public.sup_task_comments;
create policy "Visible task users read comments" on public.sup_task_comments
for select using (public.sup_can_view_task(task_id));

drop policy if exists "Visible task users add comments" on public.sup_task_comments;
create policy "Visible task users add comments" on public.sup_task_comments
for insert with check (user_id = auth.uid() and public.sup_can_view_task(task_id));

drop policy if exists "Project members read project files" on public.sup_project_files;
create policy "Project members read project files" on public.sup_project_files
for select using (public.sup_is_project_member(project_id));

drop policy if exists "Managers add project files" on public.sup_project_files;
create policy "Managers add project files" on public.sup_project_files
for insert with check (
  uploaded_by = auth.uid()
  and public.sup_can_create_project()
  and public.sup_project_access_level(project_id) in ('admin', 'manager', 'member')
);

drop policy if exists "Visible task users read task files" on public.sup_task_files;
create policy "Visible task users read task files" on public.sup_task_files
for select using (public.sup_can_view_task(task_id));

drop policy if exists "Visible task users add task files" on public.sup_task_files;
create policy "Visible task users add task files" on public.sup_task_files
for insert with check (uploaded_by = auth.uid() and public.sup_can_view_task(task_id) and public.sup_can_create_project());

drop policy if exists "Project/task users read ai suggestions" on public.sup_ai_suggestions;
create policy "Project/task users read ai suggestions" on public.sup_ai_suggestions
for select using (
  (project_id is not null and public.sup_is_project_member(project_id))
  or (task_id is not null and public.sup_can_view_task(task_id))
);

drop policy if exists "Project/task users add ai suggestions" on public.sup_ai_suggestions;
create policy "Project/task users add ai suggestions" on public.sup_ai_suggestions
for insert with check (
  requested_by = auth.uid()
  and (
    (project_id is not null and public.sup_is_project_member(project_id))
    or (task_id is not null and public.sup_can_view_task(task_id))
  )
);

insert into storage.buckets (id, name, public)
values ('sup-project-files', 'sup-project-files', false)
on conflict (id) do nothing;

drop policy if exists "Project file members can read storage" on storage.objects;
create policy "Project file members can read storage" on storage.objects
for select using (
  bucket_id = 'sup-project-files'
  and (
    exists (
      select 1 from public.sup_project_files f
      where f.storage_path = name and public.sup_is_project_member(f.project_id)
    )
    or exists (
      select 1 from public.sup_task_files f
      join public.sup_tasks t on t.id = f.task_id
      where f.storage_path = name and public.sup_can_view_task(t.id)
    )
  )
);

drop policy if exists "Project members can upload storage" on storage.objects;
create policy "Project members can upload storage" on storage.objects
for insert with check (
  bucket_id = 'sup-project-files'
  and auth.uid() is not null
);
