-- Run in the Supabase SQL editor before deploying reminders. Does not change finance records.
create table if not exists public.reminder_settings (
 id text primary key check (id = 'default'),
 value jsonb not null
);
create table if not exists public.reminder_consents (
 customer_id text primary key,
 phone text not null,
 sms boolean not null default false,
 whatsapp boolean not null default false,
 reason text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.reminder_events (
 id text primary key,
 loan_id text not null,
 customer_id text not null,
 actor_id text not null,
 actor_name text not null,
 channel text not null check (channel in ('sms','whatsapp')),
 kind text not null check (kind in ('due','balance')),
 source text not null check (source in ('manual','automatic')),
 status text not null,
 message text not null,
 provider_sid text,
 error text,
 created_at timestamptz not null default now()
);
create index if not exists reminder_events_created on public.reminder_events(created_at desc);
create index if not exists reminder_events_actor on public.reminder_events(actor_id, created_at desc);
alter table public.reminder_settings enable row level security;
alter table public.reminder_consents enable row level security;
alter table public.reminder_events enable row level security;
revoke all on public.reminder_settings, public.reminder_consents, public.reminder_events from anon, authenticated;
grant select,insert,update on public.reminder_settings, public.reminder_consents, public.reminder_events to service_role;
revoke delete,truncate on public.reminder_events from service_role;
-- Provider status may change, but the original reminder identity/content must not.
create or replace function public.guard_reminder_event() returns trigger language plpgsql set search_path=public as $$
begin
 if (to_jsonb(new) - 'status' - 'error' - 'provider_sid') is distinct from (to_jsonb(old) - 'status' - 'error' - 'provider_sid') then
  raise exception 'Original reminder records cannot be edited';
 end if;
 return new;
end;
$$;
drop trigger if exists immutable_reminder_identity on public.reminder_events;
create trigger immutable_reminder_identity before update on public.reminder_events for each row execute function public.guard_reminder_event();