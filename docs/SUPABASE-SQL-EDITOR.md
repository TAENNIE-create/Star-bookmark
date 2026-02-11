# Supabase SQL Editor에 넣을 스크립트

Supabase 대시보드 → **SQL Editor** → **New query** 에서 아래 SQL을 **순서대로** 붙여넣고 **Run** 하세요.

---

## 1단계: 테이블 + RLS + 트리거 (한 번에 실행)

```sql
-- ========== profiles: 닉네임 등 사용자 프로필 (auth.users와 1:1) ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  updated_at timestamptz default now()
);

-- ========== user_data: 앱 데이터 key-value (일기·별자리·별조각 등) ==========
create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- ========== RLS 켜기 ==========
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

-- ========== profiles 정책 (본인만 읽기/쓰기) ==========
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- ========== user_data 정책 (본인만 전체) ==========
drop policy if exists "user_data_all_own" on public.user_data;
create policy "user_data_all_own" on public.user_data for all using (auth.uid() = user_id);

-- ========== 로그인 시 프로필 자동 생성 트리거 ==========
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 2단계: profiles에 별조각·멤버십 컬럼 추가

```sql
-- profiles에 별조각 잔액·멤버십 상태 컬럼 (결제/구독 연동용)
alter table public.profiles
  add column if not exists lu_balance integer not null default 30,
  add column if not exists membership_status text not null default 'FREE';

comment on column public.profiles.lu_balance is '별조각 잔액 (기본 30)';
comment on column public.profiles.membership_status is '멤버십 등급: FREE | SHORT_STORY | HARDCOVER | CHRONICLE';
```

---

## 이미 가입한 사용자에게 프로필 행이 없을 때

트리거는 **새로 가입하는 사용자**에게만 프로필을 만듭니다. 이미 `auth.users`에 있는데 `profiles`에 행이 없다면, SQL Editor에서 아래를 실행해 주세요.

```sql
-- auth.users에 있지만 profiles에 없는 사용자에게 프로필 생성
insert into public.profiles (id, lu_balance, membership_status)
select id, 30, 'FREE'
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;
```

---

## 확인

- **Table Editor**에서 `profiles`, `user_data` 테이블이 보이는지 확인하세요.
- 앱에서 연동(로그인) 후 일기·설정 저장을 하면 `user_data`에 키가 쌓이고, 닉네임 저장 시 `profiles`가 갱신됩니다.

---

## 저장이 안 될 때

1. **Supabase SQL**  
   위 1·2·3단계 SQL을 **한 번씩 실행**했는지 확인하세요. `user_data` 테이블과 RLS 정책이 없으면 저장이 거부됩니다.

2. **앱 콘솔 로그**  
   브라우저(또는 Android WebView 디버깅)에서 **개발자 도구 → Console**을 열고, 일기 저장·설정 변경 후에 다음 메시지가 나오는지 봅니다.  
   - `[Supabase] setItem failed: ...` → Supabase 오류 메시지가 원인입니다.  
   - `[Supabase] initStorage failed ...` → 테이블/RLS 문제이거나 네트워크 오류일 수 있습니다.

3. **연동 상태**  
   설정 화면에서 **연동된 계정**이 보여야 Supabase에 저장됩니다. 미연동이면 로컬(localStorage)에만 저장됩니다.

4. **Supabase 대시보드**  
   **Table Editor → user_data**에서 해당 사용자 `user_id`로 행이 생기는지 확인하세요.
