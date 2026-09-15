create table if not exists public.users (
  id text primary key,
  name text not null,
  phone text not null,
  email text,
  username text,
  password_hash text,
  role text not null,
  assigned_agent_id text references public.users(id) on delete set null,
  created_at bigint not null
);

create table if not exists public.loans (
  id text primary key,
  customer_id text not null references public.users(id) on delete restrict,
  principal bigint not null check (principal > 0),
  balance bigint not null check (balance >= 0),
  interest_type text not null check (interest_type in ('fixed', 'floating')),
  interest_rate double precision not null check (interest_rate >= 0),
  repayment_frequency text not null check (repayment_frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  given_date date not null,
  next_due_date date not null,
  security_type text not null check (security_type in ('asset', 'surety')),
  security_file_key text,
  remarks text,
  status text not null default 'active'
);

create table if not exists public.collections (
  id text primary key,
  loan_id text not null references public.loans(id) on delete restrict,
  agent_id text not null references public.users(id) on delete restrict,
  amount bigint not null check (amount > 0),
  method text not null,
  proof_file_key text,
  remarks text,
  collected_at bigint not null
);

alter table public.loans add column if not exists foreclosed_at bigint;
alter table public.loans add column if not exists foreclosure_amount bigint;
alter table public.loans add column if not exists foreclosure_waived bigint;
alter table public.loans add column if not exists foreclosure_proof_file_key text;
alter table public.loans add column if not exists foreclosure_remarks text;
alter table public.loans add column if not exists foreclosed_by text;
alter table public.users add column if not exists username text;
alter table public.users add column if not exists password_hash text;

create unique index if not exists users_username_lower_unique on public.users (lower(username)) where username is not null;
create index if not exists users_role_idx on public.users(role);
create index if not exists users_assigned_agent_idx on public.users(assigned_agent_id);
create index if not exists loans_customer_idx on public.loans(customer_id);
create index if not exists loans_due_date_idx on public.loans(next_due_date);
create index if not exists collections_loan_idx on public.collections(loan_id);
create index if not exists collections_agent_date_idx on public.collections(agent_id, collected_at);

alter table public.users enable row level security;
alter table public.loans enable row level security;
alter table public.collections enable row level security;

insert into storage.buckets (id, name, public)
values ('fundflow-files', 'fundflow-files', false)
on conflict (id) do update set public = false;

insert into public.users (id,name,phone,email,role,assigned_agent_id,created_at) values
  ('agent-deepak','Deepak Singh','+91 98700 12001','deepak@fundflow.local','agent',null,extract(epoch from now())::bigint),
  ('agent-meera','Meera Joshi','+91 98700 12002','meera@fundflow.local','agent',null,extract(epoch from now())::bigint),
  ('agent-akash','Akash Verma','+91 98700 12003','akash@fundflow.local','agent',null,extract(epoch from now())::bigint)
on conflict (id) do nothing;

insert into public.users (id,name,phone,email,role,assigned_agent_id,created_at) values
  ('customer-arjun','Arjun Mehta','+91 98765 43010','arjun@example.com','customer','agent-deepak',extract(epoch from now())::bigint),
  ('customer-priya','Priya Sharma','+91 97654 22981','priya@example.com','customer','agent-meera',extract(epoch from now())::bigint),
  ('customer-ravi','Ravi Kumar','+91 99887 10242','ravi@example.com','customer','agent-deepak',extract(epoch from now())::bigint),
  ('customer-neha','Neha Patel','+91 91234 56908','neha@example.com','customer','agent-meera',extract(epoch from now())::bigint)
on conflict (id) do nothing;

update public.users set username='deepak',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-deepak' and username is null;
update public.users set username='meera',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-meera' and username is null;
update public.users set username='akash',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-akash' and username is null;
update public.users set username='arjun',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-arjun' and username is null;
update public.users set username='priya',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-priya' and username is null;
update public.users set username='ravi',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-ravi' and username is null;
update public.users set username='neha',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-neha' and username is null;

insert into public.loans (id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,security_type,security_file_key,remarks,status) values
  ('LN-2048','customer-arjun',250000,182400,'fixed',16,'weekly','2026-03-12','2026-09-05','asset','Property deed.pdf','Commercial expansion','active'),
  ('LN-2047','customer-priya',120000,84000,'floating',14.5,'monthly','2026-04-20','2026-09-08','asset','Gold valuation.jpg','Working capital','active'),
  ('LN-2046','customer-ravi',400000,344800,'fixed',18,'weekly','2026-02-05','2026-09-02','surety','Surety letter.pdf','Equipment purchase','overdue'),
  ('LN-2045','customer-neha',75000,22500,'fixed',12,'monthly','2026-06-18','2026-09-12','asset','Vehicle RC.jpg','Personal loan','active')
on conflict (id) do nothing;

insert into public.collections (id,loan_id,agent_id,amount,method,proof_file_key,remarks,collected_at) values
  ('RC-8391','LN-2048','agent-deepak',12500,'UPI','payment-proof-RC-8391.jpg','Payment verified',extract(epoch from now())::bigint),
  ('RC-8390','LN-2047','agent-meera',8000,'Cash',null,'Cash receipt recorded',extract(epoch from now())::bigint-1200),
  ('RC-8389','LN-2045','agent-meera',6250,'Bank transfer','payment-proof-RC-8389.jpg','Transfer verified',extract(epoch from now())::bigint-3600)
on conflict (id) do nothing;



begin;

alter table public.loans add column if not exists reopened_at bigint;
alter table public.loans add column if not exists reopen_reason text;
alter table public.loans add column if not exists reopened_by text;

create table if not exists public.audit_logs (
  id text primary key,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null check (actor_role in ('admin', 'agent')),
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at bigint not null
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function public.prevent_audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Audit logs are immutable';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_changes();

alter table public.audit_logs enable row level security;

commit;

-- Only the server service role may execute this transaction.
create or replace function public.fundflow_loan_transition(
  p_action text, p_loan_id text, p_amount numeric, p_reason text, p_proof text, p_event jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  account public.loans%rowtype;
  restored bigint;
  event_details jsonb;
  event_time bigint := extract(epoch from clock_timestamp())::bigint;
begin
  if p_event->>'actor_role' is distinct from 'admin' then raise exception 'Only the super admin can perform this action'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reason is required'; end if;
  select * into account from public.loans where id=p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if p_action='foreclose_loan' then
    if account.status in ('closed','foreclosed') then raise exception 'Only an open loan can be foreclosed'; end if;
    if p_amount is null or p_amount<0 or p_amount>account.balance or trunc(p_amount)<>p_amount then raise exception 'Invalid settlement amount'; end if;
    event_details=jsonb_build_object('original_balance',account.balance,'settlement_amount',p_amount,'waived_amount',account.balance-p_amount,'remarks',p_reason,'proof_file_key',p_proof);
    update public.loans set balance=0,status='foreclosed',foreclosed_at=event_time,
      foreclosure_amount=p_amount,foreclosure_waived=account.balance-p_amount,
      foreclosure_proof_file_key=p_proof,foreclosure_remarks=p_reason,foreclosed_by=p_event->>'actor_name',
      reopened_at=null,reopen_reason=null,reopened_by=null where id=p_loan_id;
  elsif p_action='reopen_loan' then
    if account.status<>'foreclosed' then raise exception 'Only a foreclosed loan can be reopened'; end if;
    restored=coalesce(account.foreclosure_amount,0)+coalesce(account.foreclosure_waived,0);
    event_details=jsonb_build_object('restored_balance',restored,'reason',p_reason,'previous_foreclosure',
      jsonb_build_object('amount',account.foreclosure_amount,'waived',account.foreclosure_waived,'proof',account.foreclosure_proof_file_key,'remarks',account.foreclosure_remarks,'at',account.foreclosed_at));
    update public.loans set balance=restored,status=case when next_due_date<current_date then 'overdue' else 'active' end,
      reopened_at=event_time,reopen_reason=p_reason,reopened_by=p_event->>'actor_name' where id=p_loan_id;
  else raise exception 'Invalid loan transition';
  end if;
  insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
  values(p_event->>'id',p_event->>'actor_id',p_event->>'actor_name','admin',p_action,'loan',p_loan_id,p_event->>'summary',event_details,event_time);
end;
$$;
revoke all on function public.fundflow_loan_transition(text,text,numeric,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.fundflow_loan_transition(text,text,numeric,text,text,jsonb) to service_role;
revoke update,delete,truncate on public.audit_logs from anon,authenticated,service_role;
create or replace function public.prevent_audit_log_truncate()
returns trigger language plpgsql as $$
begin raise exception 'Audit logs cannot be truncated'; end;
$$;
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate before truncate on public.audit_logs for each statement execute function public.prevent_audit_log_truncate();

begin;

-- Keep cleared customers as ledger references, hidden from the active customer list.
create or replace function public.fundflow_delete_customers(p_ids text[],p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  customer public.users%rowtype;
  deleted text[] := array[]::text[];
  blocked text[] := array[]::text[];
begin
  if p_event->>'actor_role' is distinct from 'admin' then raise exception 'Only the super admin can delete customers'; end if;
  for customer in select * from public.users where id=any(p_ids) and role='customer' order by id for update loop
    if exists(select 1 from public.loans where customer_id=customer.id and (balance>0 or status not in ('closed','foreclosed'))) then
      blocked=array_append(blocked,customer.id);
    else
      update public.users set role='archived_customer',assigned_agent_id=null where id=customer.id;
      deleted=array_append(deleted,customer.id);
    end if;
  end loop;
  insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
  values(p_event->>'id',p_event->>'actor_id',p_event->>'actor_name','admin','delete_customers','customer',array_to_string(p_ids,', '),
    'Processed customer deletion',jsonb_build_object('requested_ids',p_ids,'deleted_ids',deleted,'blocked_ids',blocked),extract(epoch from clock_timestamp())::bigint);
  return jsonb_build_object('deleted_ids',deleted,'blocked_ids',blocked);
end;
$$;
revoke all on function public.fundflow_delete_customers(text[],jsonb) from public,anon,authenticated;
grant execute on function public.fundflow_delete_customers(text[],jsonb) to service_role;

-- Serialize new/reopened loans with customer deletion.
create or replace function public.fundflow_guard_customer_loans()
returns trigger language plpgsql security definer set search_path=public as $$
declare borrower_role text;
begin
  select role into borrower_role from public.users where id=new.customer_id for update;
  if tg_op='INSERT' then
    if borrower_role is distinct from 'customer' then raise exception 'Select an active customer before creating a loan'; end if;
  elsif borrower_role='archived_customer' and (new.balance>0 or new.status not in ('closed','foreclosed')) then
    update public.users set role='customer' where id=new.customer_id;
  end if;
  return new;
end;
$$;
drop trigger if exists fundflow_customer_loan_guard on public.loans;
create trigger fundflow_customer_loan_guard before insert or update on public.loans
for each row execute function public.fundflow_guard_customer_loans();
commit;

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