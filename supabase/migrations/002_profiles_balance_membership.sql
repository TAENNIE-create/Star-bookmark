-- profiles에 별조각 잔액·멤버십 상태 컬럼 추가 (결제/구독 연동용)
alter table public.profiles
  add column if not exists lu_balance integer not null default 30,
  add column if not exists membership_status text not null default 'FREE';

comment on column public.profiles.lu_balance is '별조각 잔액 (기본 30)';
comment on column public.profiles.membership_status is '멤버십 등급: FREE | SHORT_STORY | HARDCOVER | CHRONICLE';
