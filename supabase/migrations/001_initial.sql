-- profiles: 닉네임 등 사용자 프로필 (auth.users와 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  updated_at timestamptz default now()
);

-- user_data: 앱 데이터 key-value (localStorage 마이그레이션용)
create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

create policy "user_data_all_own" on public.user_data for all using (auth.uid() = user_id);

-- 로그인 시 프로필 자동 생성 (선택)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
