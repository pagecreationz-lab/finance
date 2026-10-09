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
-- Apply to existing installations before deploying the matching application.
-- Existing rows remain nullable; no occupations, dates or signatures are fabricated.
begin;
alter table public.users add column if not exists occupation text;
alter table public.loans add column if not exists end_date date;
alter table public.collections add column if not exists customer_signature jsonb;
alter table public.collections add column if not exists signature_at bigint;

create or replace function public.rmv_protect_signed_receipt() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.customer_signature is not null then
    raise exception 'Signed receipts cannot be edited or deleted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists rmv_signed_receipt_guard on public.collections;
create trigger rmv_signed_receipt_guard before update or delete on public.collections
for each row execute function public.rmv_protect_signed_receipt();
alter table public.collections add column if not exists collected_by_name text;
alter table public.collections alter column agent_id drop not null;
create or replace function public.rmv_record_collection(p_receipt jsonb, p_actor text, p_role text, p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l public.loans; amount_received bigint; sig jsonb;
begin
  if p_role not in ('admin','agent') then raise exception 'Forbidden'; end if;
  select * into l from public.loans where id=p_receipt->>'loan_id' for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status in ('closed','foreclosed') then raise exception 'Loan is closed'; end if;
  if p_role='agent' and not exists(select 1 from public.users where id=l.customer_id and assigned_agent_id=p_actor) then
    raise exception 'Customer is not assigned to this agent';
  end if;
  amount_received=(p_receipt->>'amount')::bigint;
  if amount_received is null or amount_received<=0 or amount_received>l.balance then raise exception 'Invalid collection amount'; end if;
  sig=nullif(p_receipt->'customer_signature','null'::jsonb);
  if p_role='agent' and (sig is null or jsonb_typeof(sig)<>'array' or jsonb_array_length(sig)=0) then raise exception 'Customer signature required'; end if;
  insert into public.collections(id,loan_id,agent_id,amount,method,proof_file_key,remarks,collected_at,customer_signature,signature_at,collected_by_name)
  values(p_receipt->>'id',l.id,case when p_role='agent' then p_actor else null end,amount_received,p_receipt->>'method',nullif(p_receipt->>'proof_file_key',''),nullif(p_receipt->>'remarks',''),(p_receipt->>'collected_at')::bigint,sig,case when sig is not null then (p_receipt->>'collected_at')::bigint else null end,p_receipt->>'collected_by_name');
  update public.loans set balance=balance-amount_received,status=case when balance-amount_received=0 then 'closed' else status end where id=l.id;
  insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end;
$$;
revoke all on function public.rmv_record_collection(jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rmv_record_collection(jsonb,text,text,jsonb) to service_role;
commit;
notify pgrst, 'reload schema';

-- Prerequisites: schema, authentication, audit/reopen, customer deletion,
-- reminders, and customer-loan-signature migrations already applied.
begin;
create table if not exists public.role_permissions (
 id integer primary key check (id=1), policy jsonb not null
);
alter table public.role_permissions enable row level security;
revoke all on public.role_permissions from anon,authenticated;
grant all on public.role_permissions to service_role;
insert into public.role_permissions(id,policy) values(1,
'{"manager":["customers","loans","collections","agents","reports","reminders","create_customer","create_loan","create_agent","assign_customer"],"agent":["customers","loans","collections","reports","reminders","create_collection"]}'::jsonb)
on conflict(id) do nothing;

create or replace function public.rmv_save_permissions(p_policy jsonb,p_event jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_event->>'actor_role' is distinct from 'admin' then raise exception 'Super admin required'; end if;
 update public.role_permissions set policy=p_policy where id=1;
 insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end;$$;
revoke all on function public.rmv_save_permissions(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rmv_save_permissions(jsonb,jsonb) to service_role;

create or replace function public.rmv_manage_manager(p_user jsonb,p_event jsonb,p_create boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_event->>'actor_role' is distinct from 'admin' then raise exception 'Super admin required'; end if;
 if p_create then
   insert into public.users(id,name,phone,username,password_hash,role,created_at)
   values(p_user->>'id',p_user->>'name',p_user->>'phone',p_user->>'username',p_user->>'password_hash','manager',(p_user->>'created_at')::bigint);
 else
   if p_user->>'role' not in ('manager','archived_manager') then raise exception 'Invalid role'; end if;
   update public.users set role=p_user->>'role' where id=p_user->>'id' and role in ('manager','archived_manager');
   if not found then raise exception 'Manager not found'; end if;
 end if;
 insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end;$$;
revoke all on function public.rmv_manage_manager(jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rmv_manage_manager(jsonb,jsonb,boolean) to service_role;

-- Extend the existing transactional collection function to manager accounts.
-- Access to this function remains server/service-role only; the API checks grants.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 definition=replace(definition,'''admin'',''agent''','''admin'',''agent'',''manager''');
 execute definition;
end;$$;
commit;
notify pgrst,'reload schema';

-- Apply after rbac-migration.sql. Original signed receipts are never updated.
begin;
create sequence if not exists public.receipt_correction_sequence;
create table if not exists public.receipt_corrections (
 id text primary key, receipt_id text not null references public.collections(id), loan_id text not null references public.loans(id),
 before_amount bigint not null check(before_amount>=0), after_amount bigint not null check(after_amount>=0), base_revision text,
 reason text not null check(length(trim(reason)) between 10 and 1000), requested_by text not null, requested_name text not null,
 created_at bigint not null, status text not null check(status in ('pending','approved','rejected')),
 reviewed_by text,reviewed_name text,review_reason text,reviewed_at bigint,applied_sequence bigint unique
);
create index if not exists receipt_corrections_receipt_idx on public.receipt_corrections(receipt_id,applied_sequence desc);
alter table public.receipt_corrections enable row level security;
revoke all on public.receipt_corrections from public,anon,authenticated,service_role;
grant select on public.receipt_corrections to service_role;

create or replace function public.rmv_guard_correction() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'Correction history cannot be deleted'; end if;
 if old.status<>'pending' or new.status not in ('approved','rejected') or
 (to_jsonb(new)-array['status','reviewed_by','reviewed_name','review_reason','reviewed_at','applied_sequence']) is distinct from
 (to_jsonb(old)-array['status','reviewed_by','reviewed_name','review_reason','reviewed_at','applied_sequence']) then
 raise exception 'Correction requests and decisions are immutable'; end if;
 return new;
end;$$;
drop trigger if exists rmv_correction_guard on public.receipt_corrections;
create trigger rmv_correction_guard before update or delete on public.receipt_corrections for each row execute function public.rmv_guard_correction();

create or replace view public.collection_ledger as
select c.*,coalesce(x.after_amount,c.amount) as effective_amount,x.id as correction_id,x.reason as correction_reason,x.reviewed_name as correction_approved_by
from public.collections c left join lateral(
 select r.* from public.receipt_corrections r where r.receipt_id=c.id and r.status='approved' order by applied_sequence desc limit 1
) x on true;
revoke all on public.collection_ledger from public,anon,authenticated;
grant select on public.collection_ledger to service_role;

create or replace function public.rmv_correct_receipt(p_body jsonb,p_actor text,p_name text,p_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.receipt_corrections; r public.collections; l public.loans;
 revision text; current_amount bigint; balance_after bigint; stamp bigint=extract(epoch from now())::bigint;
 action text=p_body->>'action'; reason_text text=trim(p_body->>'reason');
begin
 if p_role not in ('admin','manager') or action not in ('request','approve','reject') then raise exception 'Forbidden'; end if;
 if action<>'request' and p_role<>'admin' then raise exception 'Super admin approval required'; end if;
 if reason_text is null or length(reason_text) not between 10 and 1000 then raise exception 'A valid reason is required'; end if;
 if action='request' then
   select * into c from public.receipt_corrections where id=p_body->>'id';
   if found then
     if c.requested_by<>p_actor or c.receipt_id<>p_body->>'receipt_id' or c.after_amount<>(p_body->>'amount')::bigint or c.reason<>reason_text then raise exception 'Request ID already used'; end if;
     return to_jsonb(c);
   end if;
   select * into r from public.collections where id=p_body->>'receipt_id' for update;
   if not found then raise exception 'Receipt not found'; end if;
 else
   select * into c from public.receipt_corrections where id=p_body->>'id' for update;
   if not found or c.status<>'pending' then raise exception 'Request not found or already decided'; end if;
   select * into r from public.collections where id=c.receipt_id for update;
 end if;
 select * into l from public.loans where id=r.loan_id for update;
 if not found then raise exception 'Loan not found'; end if;
 select id,after_amount into revision,current_amount from public.receipt_corrections where receipt_id=r.id and status='approved' order by applied_sequence desc limit 1;
 current_amount=coalesce(current_amount,r.amount);
 if action='request' then
   if l.status='foreclosed' then raise exception 'Reopen the foreclosed loan before correcting receipts'; end if;
   if nullif(p_body->>'base_revision','') is distinct from revision or (p_body->>'before_amount')::bigint<>current_amount then raise exception 'Receipt changed. Refresh before submitting.'; end if;
   if (p_body->>'amount')::numeric<>trunc((p_body->>'amount')::numeric) or (p_body->>'amount')::bigint<0 or (p_body->>'amount')::bigint=current_amount then raise exception 'Invalid corrected amount'; end if;
   insert into public.receipt_corrections(id,receipt_id,loan_id,before_amount,after_amount,base_revision,reason,requested_by,requested_name,created_at,status)
   values(p_body->>'id',r.id,l.id,current_amount,(p_body->>'amount')::bigint,revision,reason_text,p_actor,p_name,stamp,'pending') returning * into c;
   insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
   values('LOG-'||gen_random_uuid(),p_actor,p_name,p_role,'receipt_correction_requested','collection',r.id,'Requested receipt correction',to_jsonb(c),stamp);
   if p_role='manager' then return to_jsonb(c); end if;
 end if;
 if action='reject' then
   update public.receipt_corrections set status='rejected',reviewed_by=p_actor,reviewed_name=p_name,review_reason=reason_text,reviewed_at=stamp where id=c.id returning * into c;
 else
   if l.status='foreclosed' then raise exception 'Reopen the foreclosed loan before applying a correction'; end if;
   if revision is distinct from c.base_revision or current_amount<>c.before_amount then raise exception 'Stale request. Reject and submit a new correction.'; end if;
   balance_after=l.balance+c.before_amount-c.after_amount;
   if balance_after<0 then raise exception 'Correction exceeds outstanding balance'; end if;
   update public.loans set balance=balance_after,status=case when balance_after=0 then 'closed' when next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end where id=l.id;
   if balance_after>0 then update public.users set role='customer' where id=l.customer_id and role='archived_customer'; end if;
   update public.receipt_corrections set status='approved',reviewed_by=p_actor,reviewed_name=p_name,review_reason=reason_text,reviewed_at=stamp,applied_sequence=nextval('public.receipt_correction_sequence') where id=c.id returning * into c;
 end if;
 insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
 values('LOG-'||gen_random_uuid(),p_actor,p_name,p_role,'receipt_correction_'||c.status,'collection',r.id,case when c.status='approved' then 'Approved receipt correction' else 'Rejected receipt correction' end,to_jsonb(c)||jsonb_build_object('balance_after',balance_after),stamp);
 return to_jsonb(c);
end;$$;
revoke all on function public.rmv_correct_receipt(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.rmv_correct_receipt(jsonb,text,text,text) to service_role;

-- Preserve existing restrictions; enable requests only for managers already allowed collections.
update public.role_permissions set policy=jsonb_set(policy,'{manager}',(policy->'manager')||'["request_correction"]'::jsonb)
where (policy->'manager') ? 'collections' and not (policy->'manager') ? 'request_correction';
commit;
notify pgrst,'reload schema';

-- Apply after rbac-migration.sql. Deletes retain the user ID for financial history.
begin;
create or replace function public.rmv_edit_manager(p_user jsonb,p_event jsonb,p_delete boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_event->>'actor_role' is distinct from 'admin' then raise exception 'Super admin required'; end if;
 perform 1 from public.users where id=p_user->>'id' and role in ('manager','archived_manager') for update;
 if not found then raise exception 'Manager not found'; end if;
 if p_delete then
   update public.users set role='deleted_manager',password_hash=null where id=p_user->>'id';
 else
   if length(trim(p_user->>'name')) not between 1 and 100 or (p_user->>'username') !~ '^[a-z0-9._-]{3,60}$' then raise exception 'Invalid manager details'; end if;
   update public.users set name=p_user->>'name',username=p_user->>'username',password_hash=coalesce(p_user->>'password_hash',password_hash) where id=p_user->>'id';
 end if;
 insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end;$$;
revoke all on function public.rmv_edit_manager(jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rmv_edit_manager(jsonb,jsonb,boolean) to service_role;
commit;
notify pgrst,'reload schema';

-- Existing app prerequisites: schema, authentication, audit, occupation and RBAC migrations.
begin;
create table public.customer_requests(
 id text primary key,
 agent_id text not null references public.users(id),
 agent_name text not null,
 name text not null check(length(trim(name)) between 1 and 100),
 phone text not null check(phone ~ '^[0-9]{7,15}$'),
 email text,
 occupation text not null check(length(trim(occupation)) between 1 and 120),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at bigint not null,
 customer_id text references public.users(id),
 reviewed_by text,reviewed_at bigint,review_reason text
);
create index customer_requests_agent_created_idx on public.customer_requests(agent_id,created_at desc,id desc);
create index customer_requests_created_idx on public.customer_requests(created_at desc,id desc);
alter table public.customer_requests enable row level security;
revoke all on public.customer_requests from public,anon,authenticated;
grant select,insert,update on public.customer_requests to service_role;

-- Existing audit definitions only allowed admin/agent; manager review is also audited.
alter table public.audit_logs drop constraint if exists audit_logs_actor_role_check;
alter table public.audit_logs add constraint audit_logs_actor_role_check check(actor_role in ('admin','manager','agent','customer'));

create or replace function public.rmv_customer_request(p_body jsonb,p_actor text,p_name text,p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.customer_requests; action text=p_body->>'action'; stamp bigint=extract(epoch from now())::bigint;
 reason_text text=nullif(trim(p_body->>'reason'),''); actor_role text; actor_name text; policy jsonb;
begin
 if action is null or action not in ('submit','approve','reject') or p_role is null or p_role not in ('admin','manager','agent') then raise exception 'Access denied'; end if;
 if p_role<>'admin' then
   select u.role,u.name into actor_role,actor_name from public.users u where u.id=p_actor;
   if actor_role is distinct from p_role then raise exception 'Account no longer active'; end if;
   select rp.policy into policy from public.role_permissions rp where rp.id=1;
   if not coalesce((policy->p_role) ? 'customers',false) or not coalesce((policy->p_role) ? case when p_role='agent' then 'submit_customer' else 'approve_customer' end,false) then raise exception 'Permission denied'; end if;
 else actor_name=p_name;
 end if;
 if action='submit' then
   if p_role<>'agent' then raise exception 'Only agents submit customers'; end if;
   -- Serializes retries with the same id without creating duplicate audit entries.
   perform pg_advisory_xact_lock(hashtextextended(p_body->>'id',0));
   select * into r from public.customer_requests where id=p_body->>'id';
   if found then
     if r.agent_id<>p_actor or r.name is distinct from p_body->>'name' or r.phone is distinct from p_body->>'phone' or r.occupation is distinct from p_body->>'occupation' or r.email is distinct from nullif(p_body->>'email','') then raise exception 'Request ID already used'; end if;
     return to_jsonb(r);
   end if;
   insert into public.customer_requests(id,agent_id,agent_name,name,phone,email,occupation,created_at)
   values(p_body->>'id',p_actor,actor_name,p_body->>'name',p_body->>'phone',nullif(p_body->>'email',''),p_body->>'occupation',stamp) returning * into r;
 else
   if p_role not in ('admin','manager') then raise exception 'Admin Manager approval required'; end if;
   if length(reason_text)>1000 then raise exception 'Review reason must be at most 1,000 characters'; end if;
   select * into r from public.customer_requests where id=p_body->>'id' for update;
   if not found then raise exception 'Request not found'; end if;
   if r.status<>'pending' then raise exception 'Request already reviewed'; end if;
   if action='approve' then
     perform 1 from public.users where id=r.agent_id and role='agent' for update;
     if not found then raise exception 'Submitting agent is no longer active. Reject this request.'; end if;
     insert into public.users(id,name,phone,email,occupation,role,assigned_agent_id,created_at)
     values('customer-'||r.id,r.name,r.phone,r.email,r.occupation,'customer',r.agent_id,stamp);
   end if;
   update public.customer_requests set status=case when action='approve' then 'approved' else 'rejected' end,
     customer_id=case when action='approve' then 'customer-'||r.id else null end,reviewed_by=p_actor,reviewed_at=stamp,review_reason=reason_text
     where id=r.id returning * into r;
 end if;
 insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
 values('LOG-'||gen_random_uuid(),p_actor,actor_name,p_role,
 case when action='submit' then 'customer_submitted' when action='approve' then 'customer_approved' else 'customer_rejected' end,
 'customer',r.id,case when action='submit' then 'Submitted customer for approval' when action='approve' then 'Approved agent-created customer' else 'Rejected agent-created customer' end,
 jsonb_build_object('request_id',r.id,'customer_id',r.customer_id,'agent_id',r.agent_id,'reason',reason_text),stamp);
 return to_jsonb(r);
end;$$;
revoke all on function public.rmv_customer_request(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.rmv_customer_request(jsonb,text,text,text) to service_role;

-- Add the new actions only to roles already permitted customer access.
update public.role_permissions set policy=jsonb_set(policy,'{agent}',(policy->'agent')||'["submit_customer"]'::jsonb)
where (policy->'agent') ? 'customers' and not (policy->'agent') ? 'submit_customer';
update public.role_permissions set policy=jsonb_set(policy,'{manager}',(policy->'manager')||'["approve_customer"]'::jsonb)
where (policy->'manager') ? 'customers' and not (policy->'manager') ? 'approve_customer';
commit;
notify pgrst,'reload schema';

-- Prerequisites: existing app schema, occupation/end-date, RBAC and customer approval migrations.
begin;
create table public.loan_requests(
 id text primary key,agent_id text not null references public.users(id),agent_name text not null,
 customer_id text not null references public.users(id),customer_name text not null,
 principal bigint not null check(principal>0 and principal<=9007199254740991),
 interest_type text not null check(interest_type in ('fixed','floating')),
 interest_rate double precision not null check(interest_rate>=0 and interest_rate<'Infinity'::double precision),
 repayment_frequency text not null check(repayment_frequency in ('daily','weekly','monthly')),
 given_date date not null check(given_date>='1900-01-01'),next_due_date date not null,end_date date not null,
 security_type text not null check(security_type in ('asset','surety')),remarks text check(length(remarks)<=2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at bigint not null,loan_id text references public.loans(id),reviewed_by text,reviewed_at bigint,review_reason text,
 check(end_date>=given_date and next_due_date between given_date and end_date)
);
create index loan_requests_agent_created_idx on public.loan_requests(agent_id,created_at desc,id desc);
create index loan_requests_created_idx on public.loan_requests(created_at desc,id desc);
create index loan_requests_customer_idx on public.loan_requests(customer_id);
create index loan_requests_loan_idx on public.loan_requests(loan_id) where loan_id is not null;
alter table public.loan_requests enable row level security;
revoke all on public.loan_requests from public,anon,authenticated;
grant select,insert,update on public.loan_requests to service_role;

create or replace function public.rmv_loan_request(p_body jsonb,p_actor text,p_name text,p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.loan_requests; action text=p_body->>'action'; stamp bigint=extract(epoch from now())::bigint;
 reason_text text=nullif(trim(p_body->>'reason'),''); actor_role text; actor_name text; policy jsonb; borrower_name text;
begin
 if action is null or action not in ('submit','approve','reject') or p_role is null or p_role not in ('admin','manager','agent') then raise exception 'Access denied'; end if;
 if p_role<>'admin' then
   select u.role,u.name into actor_role,actor_name from public.users u where u.id=p_actor;
   if actor_role is distinct from p_role then raise exception 'Account no longer active'; end if;
   select rp.policy into policy from public.role_permissions rp where rp.id=1;
   if not coalesce((policy->p_role) ?& array['customers','loans',case when p_role='agent' then 'submit_loan' else 'approve_loan' end],false) then raise exception 'Permission denied'; end if;
 else actor_name=p_name;
 end if;
 if action='submit' then
   if p_role<>'agent' then raise exception 'Only agents submit loans'; end if;
   perform pg_advisory_xact_lock(hashtextextended('loan-request:'||(p_body->>'id'),0));
   select * into r from public.loan_requests where id=p_body->>'id';
   if found then
     if r.agent_id<>p_actor or r.customer_id is distinct from p_body->>'customer_id' or r.principal is distinct from (p_body->>'principal')::bigint
       or r.interest_type is distinct from p_body->>'interest_type' or r.interest_rate is distinct from (p_body->>'interest_rate')::double precision
       or r.repayment_frequency is distinct from p_body->>'repayment_frequency' or r.given_date is distinct from (p_body->>'given_date')::date
       or r.next_due_date is distinct from (p_body->>'next_due_date')::date or r.end_date is distinct from (p_body->>'end_date')::date
       or r.security_type is distinct from p_body->>'security_type' or r.remarks is distinct from nullif(p_body->>'remarks','') then raise exception 'Request ID already used'; end if;
     return to_jsonb(r);
   end if;
   select name into borrower_name from public.users where id=p_body->>'customer_id' and role='customer' and assigned_agent_id=p_actor for share;
   if not found then raise exception 'Choose an approved customer currently assigned to you'; end if;
   if (p_body->>'principal')::numeric<>trunc((p_body->>'principal')::numeric) then raise exception 'Whole-rupee loan amount required'; end if;
   insert into public.loan_requests(id,agent_id,agent_name,customer_id,customer_name,principal,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,end_date,security_type,remarks,created_at)
   values(p_body->>'id',p_actor,actor_name,p_body->>'customer_id',borrower_name,(p_body->>'principal')::bigint,p_body->>'interest_type',(p_body->>'interest_rate')::double precision,p_body->>'repayment_frequency',(p_body->>'given_date')::date,(p_body->>'next_due_date')::date,(p_body->>'end_date')::date,p_body->>'security_type',nullif(p_body->>'remarks',''),stamp) returning * into r;
 else
   if p_role not in ('admin','manager') then raise exception 'Admin Manager approval required'; end if;
   if length(reason_text)>1000 then raise exception 'Review reason must be at most 1,000 characters'; end if;
   select * into r from public.loan_requests where id=p_body->>'id' for update;
   if not found then raise exception 'Request not found'; end if;
   if r.status<>'pending' then raise exception 'Request already reviewed'; end if;
   if action='approve' then
     perform 1 from public.users where id=r.agent_id and role='agent' for update;
     if not found then raise exception 'Submitting agent is no longer active. Reject this request.'; end if;
     perform 1 from public.users where id=r.customer_id and role='customer' and assigned_agent_id=r.agent_id for update;
     if not found then raise exception 'Customer is no longer active or assigned to the submitting agent. Reject and resubmit.'; end if;
     insert into public.loans(id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,end_date,security_type,security_file_key,remarks,status)
     values('LN-'||r.id,r.customer_id,r.principal,r.principal,r.interest_type,r.interest_rate,r.repayment_frequency,r.given_date,r.next_due_date,r.end_date,r.security_type,null,r.remarks,
       case when r.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end);
   end if;
   update public.loan_requests set status=case when action='approve' then 'approved' else 'rejected' end,
     loan_id=case when action='approve' then 'LN-'||r.id else null end,reviewed_by=p_actor,reviewed_at=stamp,review_reason=reason_text where id=r.id returning * into r;
 end if;
 insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
 values('LOG-'||gen_random_uuid(),p_actor,actor_name,p_role,
 case when action='submit' then 'loan_submitted' when action='approve' then 'loan_approved' else 'loan_rejected' end,
 'loan',r.id,case when action='submit' then 'Submitted loan for approval' when action='approve' then 'Approved agent-created loan' else 'Rejected agent-created loan' end,
 jsonb_build_object('request_id',r.id,'loan_id',r.loan_id,'customer_id',r.customer_id,'agent_id',r.agent_id,'principal',r.principal,'reason',reason_text),stamp);
 return to_jsonb(r);
end;$$;
revoke all on function public.rmv_loan_request(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.rmv_loan_request(jsonb,text,text,text) to service_role;
update public.role_permissions set policy=jsonb_set(policy,'{agent}',(policy->'agent')||'["submit_loan"]'::jsonb)
where (policy->'agent') ?& array['customers','loans'] and not (policy->'agent') ? 'submit_loan';
update public.role_permissions set policy=jsonb_set(policy,'{manager}',(policy->'manager')||'["approve_loan"]'::jsonb)
where (policy->'manager') ?& array['customers','loans'] and not (policy->'manager') ? 'approve_loan';
commit;
notify pgrst,'reload schema';

-- Apply after the existing loan, collection, RBAC and approval migrations.
-- No receipt is rewritten. Existing settled/ambiguous loans remain legacy.
begin;
alter table public.loans add column if not exists interest_model text not null default 'legacy';
alter table public.loans add column if not exists interest_amount bigint;
alter table public.loans add column if not exists first_due_date date;

create or replace function public.rmv_term_interest(p bigint,r double precision)
returns bigint language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
 if p is null or p<=0 or p>9007199254740991 or r is null or r<0 or r>10000 or r='NaN'::double precision or abs(r*10000-round(r*10000))>0.000001 then
   raise exception 'Valid whole-rupee principal and full-term rate (maximum four decimal places) required';
 end if;
 amount=floor((p::numeric*round((r*10000)::numeric)+500000)/1000000);
 if p+amount>9007199254740991 then raise exception 'Total repayable exceeds supported amount'; end if;
 return amount::bigint;
end;$$;

create or replace function public.rmv_installment_dates(first_due date,end_date date,frequency text)
returns date[] language plpgsql immutable set search_path='' as $$
declare dates date[]='{}'; d date; m date; day_no integer=extract(day from first_due)::integer; i integer;
begin
 if first_due is null or end_date is null or first_due>end_date or frequency is null or frequency not in ('daily','weekly','monthly','yearly') then raise exception 'Valid first due date, end date and return basis required'; end if;
 for i in 0..9999 loop
   if frequency in ('daily','weekly') then d=first_due+i*(case when frequency='weekly' then 7 else 1 end);
   else
     m=(date_trunc('month',first_due)+(i*(case when frequency='yearly' then 12 else 1 end))*interval '1 month')::date;
     d=m+least(day_no,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
   end if;
   if d>=end_date then return array_append(dates,end_date); end if;
   dates=array_append(dates,d);
 end loop;
 raise exception 'Loan term cannot exceed 10,000 installments';
end;$$;

create or replace function public.rmv_calculate_loan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare interest bigint; dates date[]; count_dates integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; i integer; next_date date;
begin
 if tg_op='INSERT' then
   if new.interest_type<>'fixed' then raise exception 'New loans require full-term flat interest'; end if;
   new.interest_model='flat_term_v1';new.first_due_date=new.next_due_date;
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   -- All application creation paths supply an untouched principal balance.
   if new.balance<>new.principal then raise exception 'New loans must start with the principal balance'; end if;
   new.balance=new.principal+interest;
 elsif old.interest_model='legacy' and new.interest_model='flat_term_v1' then
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   new.first_due_date=new.next_due_date;new.balance=old.balance+interest;
 elsif old.interest_model='flat_term_v1' then
   if new.interest_model<>old.interest_model or new.interest_type<>old.interest_type then raise exception 'Loan interest model cannot be changed'; end if;
   if old.status in ('closed','foreclosed') and (new.principal,new.interest_rate,new.end_date,new.repayment_frequency,new.next_due_date) is distinct from (old.principal,old.interest_rate,old.end_date,old.repayment_frequency,old.next_due_date) then raise exception 'Closed or foreclosed loan terms cannot be changed'; end if;
   new.first_due_date=case when new.next_due_date is distinct from old.next_due_date then new.next_due_date else old.first_due_date end;
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   new.balance=new.balance+interest-old.interest_amount+new.principal-old.principal;
 else return new;
 end if;
 new.interest_amount=interest;
 if new.balance<0 or new.balance>new.principal+interest then raise exception 'Balance must be between zero and total repayable'; end if;
 if new.status='foreclosed' then return new; end if;
 if new.given_date is null or new.first_due_date<new.given_date then raise exception 'First due date must be on or after start'; end if;
 dates=public.rmv_installment_dates(new.first_due_date,new.end_date,new.repayment_frequency);
 count_dates=cardinality(dates);base=(new.principal+interest)/count_dates;extra=(new.principal+interest)%count_dates;
 credited=new.principal+interest-new.balance;
 for i in 1..count_dates loop
   cumulative=cumulative+base+case when i<=extra then 1 else 0 end;
   if cumulative>credited then next_date=dates[i];exit;end if;
 end loop;
 new.next_due_date=coalesce(next_date,new.end_date);
 new.status=case when new.balance=0 then 'closed' when new.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end;
 return new;
end;$$;
drop trigger if exists rmv_calculate_loan on public.loans;
create trigger rmv_calculate_loan before insert or update on public.loans for each row execute function public.rmv_calculate_loan();

-- Convert only unambiguous open, principal-only balances. Preserve prior credits.
with converted as (
 update public.loans set interest_model='flat_term_v1'
 where interest_model='legacy' and interest_type='fixed' and status in ('active','overdue')
 and principal>0 and balance between 0 and principal and principal<=900719925474
 and interest_rate between 0 and 10000 and abs(interest_rate*10000-round(interest_rate*10000))<=0.000001
 and given_date is not null and end_date is not null and next_due_date between given_date and end_date
 and end_date-next_due_date<=9999 and repayment_frequency in ('daily','weekly','monthly','yearly')
 returning *
)
insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
select 'LOG-flat-term-'||id,'system','Loan calculation migration','admin','loan_calculation_migrated','loan',id,
 'Applied full-term flat interest while preserving existing credits',
 jsonb_build_object('previous_balance',balance-interest_amount,'balance',balance,'interest_amount',interest_amount),extract(epoch from now())::bigint from converted;

revoke all on function public.rmv_term_interest(bigint,double precision),public.rmv_installment_dates(date,date,text),public.rmv_calculate_loan() from public,anon,authenticated;
grant execute on function public.rmv_term_interest(bigint,double precision),public.rmv_installment_dates(date,date,text),public.rmv_calculate_loan() to service_role;
commit;
notify pgrst,'reload schema';

-- Preserve the installed function's assignment checks, locks, audit and role grants.
begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 definition=replace(definition,$guard$if p_role='agent' and (sig is null or jsonb_typeof(sig)<>'array' or jsonb_array_length(sig)=0) then raise exception 'Customer signature required'; end if;$guard$,'-- Customer signatures are optional; existing signed receipts remain immutable.');
 if position('Customer signature required' in definition)>0 then raise exception 'Unexpected collection function version; review signature validation before deploying'; end if;
 execute definition;
end;
$migration$;
commit;
notify pgrst,'reload schema';

-- Apply after agent loan approval and flat-term interest migrations.
begin;
alter table public.loan_requests alter column customer_id drop not null;
alter table public.loan_requests add column loan_number text;
alter table public.loan_requests add column new_customer jsonb;
alter table public.loan_requests add constraint loan_request_customer_present check(customer_id is not null or new_customer is not null);
alter table public.loan_requests add constraint loan_request_number_format check(loan_number is null or loan_number ~ '^[A-Z0-9][A-Z0-9/_-]{0,39}$');
create unique index loan_request_pending_number on public.loan_requests(loan_number) where status='pending' and loan_number is not null;
-- Fails safely if pre-existing case-insensitive duplicates need review; never changes historical IDs.
create unique index loans_number_case_insensitive on public.loans(upper(id));
create or replace function public.rmv_loan_request(p_body jsonb,p_actor text,p_name text,p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.loan_requests; action text=p_body->>'action'; stamp bigint=extract(epoch from now())::bigint;
 reason_text text=nullif(trim(p_body->>'reason'),''); actor_role text; actor_name text; policy jsonb; borrower_name text; new_borrower jsonb=nullif(p_body->'new_customer','null'::jsonb); number_text text=upper(trim(p_body->>'loan_number')); created_customer text;
begin
 if action is null or action not in ('submit','approve','reject') or p_role is null or p_role not in ('admin','manager','agent') then raise exception 'Access denied'; end if;
 if p_role<>'admin' then
   select u.role,u.name into actor_role,actor_name from public.users u where u.id=p_actor;
   if actor_role is distinct from p_role then raise exception 'Account no longer active'; end if;
   select rp.policy into policy from public.role_permissions rp where rp.id=1;
   if not coalesce((policy->p_role) ?& array['customers','loans',case when p_role='agent' then 'submit_loan' else 'approve_loan' end],false) then raise exception 'Permission denied'; end if;
 else actor_name=p_name;
 end if;
 if action='submit' then
   if number_text is null or number_text !~ '^[A-Z0-9][A-Z0-9/_-]{0,39}$' then raise exception 'Enter a valid manual loan number'; end if;
   if new_borrower is not null then
     if not coalesce((policy->p_role) ? 'submit_customer',false) then raise exception 'Customer submission permission required'; end if;
     if nullif(p_body->>'customer_id','') is not null or jsonb_typeof(new_borrower)<>'object'
       or coalesce(length(trim(new_borrower->>'name')),0) not between 1 and 100
       or coalesce(new_borrower->>'phone','') !~ '^[0-9]{7,15}$'
       or coalesce(length(trim(new_borrower->>'occupation')),0) not between 1 and 120
       or length(coalesce(new_borrower->>'email',''))>254
       then raise exception 'Valid new customer details required'; end if;
   end if;
   if p_role<>'agent' then raise exception 'Only agents submit loans'; end if;
   perform pg_advisory_xact_lock(hashtextextended('loan-request:'||(p_body->>'id'),0));
   select * into r from public.loan_requests where id=p_body->>'id';
   if found then
     if r.agent_id<>p_actor or coalesce(r.customer_id,'') is distinct from coalesce(p_body->>'customer_id','') or r.loan_number is distinct from number_text or r.new_customer is distinct from new_borrower or r.principal is distinct from (p_body->>'principal')::bigint
       or r.interest_type is distinct from p_body->>'interest_type' or r.interest_rate is distinct from (p_body->>'interest_rate')::double precision
       or r.repayment_frequency is distinct from p_body->>'repayment_frequency' or r.given_date is distinct from (p_body->>'given_date')::date
       or r.next_due_date is distinct from (p_body->>'next_due_date')::date or r.end_date is distinct from (p_body->>'end_date')::date
       or r.security_type is distinct from p_body->>'security_type' or r.remarks is distinct from nullif(p_body->>'remarks','') then raise exception 'Request ID already used'; end if;
     return to_jsonb(r);
   end if;
   perform pg_advisory_xact_lock(hashtextextended('loan-number:'||number_text,0));
   if exists(select 1 from public.loans where upper(id)=number_text) or exists(select 1 from public.loan_requests where loan_number=number_text and status='pending') then raise exception 'Loan number already in use or awaiting approval'; end if;
   if new_borrower is not null then borrower_name=new_borrower->>'name';
   else
   select name into borrower_name from public.users where id=p_body->>'customer_id' and role='customer' and assigned_agent_id=p_actor for share;
   if not found then raise exception 'Choose an approved customer currently assigned to you'; end if; end if;
   if (p_body->>'principal')::numeric<>trunc((p_body->>'principal')::numeric) then raise exception 'Whole-rupee loan amount required'; end if;
   insert into public.loan_requests(id,agent_id,agent_name,customer_id,customer_name,principal,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,end_date,security_type,remarks,created_at,loan_number,new_customer)
   values(p_body->>'id',p_actor,actor_name,nullif(p_body->>'customer_id',''),borrower_name,(p_body->>'principal')::bigint,p_body->>'interest_type',(p_body->>'interest_rate')::double precision,p_body->>'repayment_frequency',(p_body->>'given_date')::date,(p_body->>'next_due_date')::date,(p_body->>'end_date')::date,p_body->>'security_type',nullif(p_body->>'remarks',''),stamp,number_text,new_borrower) returning * into r;
 else
   if p_role not in ('admin','manager') then raise exception 'Admin Manager approval required'; end if;
   if length(reason_text)>1000 then raise exception 'Review reason must be at most 1,000 characters'; end if;
   select * into r from public.loan_requests where id=p_body->>'id' for update;
   if not found then raise exception 'Request not found'; end if;
   if r.status<>'pending' then raise exception 'Request already reviewed'; end if;
   if r.new_customer is not null and p_role<>'admin' and not coalesce((policy->p_role) ? 'approve_customer',false) then raise exception 'Customer approval permission required'; end if;
   if action='approve' then
     number_text=coalesce(r.loan_number,'LN-'||r.id);
     perform pg_advisory_xact_lock(hashtextextended('loan-number:'||upper(number_text),0));
     if exists(select 1 from public.loans where upper(id)=upper(number_text)) then raise exception 'Loan number already in use'; end if;
     perform 1 from public.users where id=r.agent_id and role='agent' for update;
     if not found then raise exception 'Submitting agent is no longer active. Reject this request.'; end if;
     if r.new_customer is not null then
       created_customer='customer-loan-'||r.id;
       insert into public.users(id,name,phone,email,occupation,role,assigned_agent_id,created_at)
       values(created_customer,r.new_customer->>'name',r.new_customer->>'phone',nullif(r.new_customer->>'email',''),r.new_customer->>'occupation','customer',r.agent_id,stamp);
       r.customer_id=created_customer;
     else
     perform 1 from public.users where id=r.customer_id and role='customer' and assigned_agent_id=r.agent_id for update;
     if not found then raise exception 'Customer is no longer active or assigned to the submitting agent. Reject and resubmit.'; end if; end if;
     insert into public.loans(id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,end_date,security_type,security_file_key,remarks,status)
     values(number_text,r.customer_id,r.principal,r.principal,r.interest_type,r.interest_rate,r.repayment_frequency,r.given_date,r.next_due_date,r.end_date,r.security_type,null,r.remarks,
       case when r.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end);
   end if;
   update public.loan_requests set status=case when action='approve' then 'approved' else 'rejected' end,
     customer_id=r.customer_id,loan_id=case when action='approve' then number_text else null end,reviewed_by=p_actor,reviewed_at=stamp,review_reason=reason_text where id=r.id returning * into r;
 end if;
 insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
 values('LOG-'||gen_random_uuid(),p_actor,actor_name,p_role,
 case when action='submit' then 'loan_submitted' when action='approve' then 'loan_approved' else 'loan_rejected' end,
 'loan',r.id,case when action='submit' then 'Submitted loan for approval' when action='approve' then 'Approved agent-created loan' else 'Rejected agent-created loan' end,
 jsonb_build_object('request_id',r.id,'loan_id',r.loan_id,'customer_id',r.customer_id,'agent_id',r.agent_id,'principal',r.principal,'combined',r.new_customer is not null,'loan_number',r.loan_number,'reason',reason_text),stamp);
 return to_jsonb(r);
end;$$;
revoke all on function public.rmv_loan_request(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.rmv_loan_request(jsonb,text,text,text) to service_role;
commit;
notify pgrst,'reload schema';

-- Run after combined customer/loan approval. Receipts remain immutable.
begin;
create or replace function public.rmv_upfront_interest(p bigint,r double precision)
returns bigint language plpgsql immutable set search_path='' as $$
declare interest numeric;
begin
 if p is null or p<=0 or p>9007199254740991 or r is null or r<0 or r>=100 or r='NaN'::double precision or abs(r*10000-round(r*10000))>0.000001 then raise exception 'Valid lending amount and upfront rate below 100%% required'; end if;
 interest=floor((p::numeric*round((r*10000)::numeric)+500000)/1000000);
 if interest>=p then raise exception 'Remaining repayable amount must be positive'; end if;
 return interest::bigint;
end;$$;
create or replace function public.rmv_upfront_dates(start_date date,frequency text)
returns date[] language plpgsql immutable set search_path='' as $$
declare dates date[]='{}'; i integer; n integer; m date; d date;
begin
 if start_date is null or start_date<'1900-01-01' or frequency is null or frequency not in ('daily','weekly','monthly','yearly') then raise exception 'Valid start date and loan type required'; end if;
 n=case frequency when 'daily' then 100 when 'weekly' then 10 else 12 end;
 for i in 1..n loop
  if frequency in ('daily','weekly') then d=start_date+i*(case frequency when 'daily' then 1 else 7 end);
  else
   m=(date_trunc('month',start_date)+i*interval '1 month')::date;
   d=m+least(extract(day from start_date)::integer,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
  end if;
  if d>'9999-12-31' then raise exception 'End date outside supported range'; end if;
  dates=array_append(dates,d);
 end loop;
 return dates;
end;$$;
create or replace function public.rmv_calculate_upfront_loan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare interest bigint; total bigint; old_total bigint; dates date[]; n integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; i integer; due date;
begin
 if tg_op='UPDATE' and old.interest_model<>'upfront_net_v1' and new.interest_model<>'upfront_net_v1' then return new; end if;
 if new.interest_type<>'fixed' then raise exception 'New loans require upfront fixed-rate deduction'; end if;
 interest=public.rmv_upfront_interest(new.principal,new.interest_rate);total=new.principal-interest;
 dates=public.rmv_upfront_dates(new.given_date,new.repayment_frequency);
 if tg_op='INSERT' then
  if new.balance<>new.principal then raise exception 'New loans must start with untouched lending amount'; end if;
  new.balance=total;new.interest_model='upfront_net_v1';
 elsif old.interest_model='upfront_net_v1' then
  if new.interest_model<>old.interest_model then raise exception 'Interest model cannot be changed'; end if;
  if old.status in ('closed','foreclosed') and (new.principal,new.interest_rate,new.given_date,new.repayment_frequency) is distinct from (old.principal,old.interest_rate,old.given_date,old.repayment_frequency) then raise exception 'Settled loan terms cannot be changed'; end if;
  new.balance=new.balance+total-(old.principal-old.interest_amount);
 else
  old_total=old.principal+case when old.interest_model='flat_term_v1' then coalesce(old.interest_amount,0) else 0 end;
  if old.status not in ('active','overdue') or old.balance>old_total then raise exception 'Loan needs manual review before conversion'; end if;
  new.balance=total-(old_total-old.balance);
 end if;
 if new.balance<0 or new.balance>total then raise exception 'Revised total is below existing credits or balance'; end if;
 new.interest_amount=interest;new.first_due_date=dates[1];new.end_date=dates[cardinality(dates)];
 if new.repayment_frequency='monthly' then new.repayment_frequency='yearly'; end if;
 if new.status='foreclosed' then return new; end if;
 n=cardinality(dates);base=total/n;extra=total%n;credited=total-new.balance;
 for i in 1..n loop
  cumulative=cumulative+base+case when i<=extra then 1 else 0 end;
  if cumulative>credited then due=dates[i];exit;end if;
 end loop;
 new.next_due_date=coalesce(due,new.end_date);
 new.status=case when new.balance=0 then 'closed' when new.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end;
 return new;
end;$$;
drop trigger if exists rmv_calculate_loan on public.loans;
-- Retain historical calculations for skipped/settled old-model loans.
create trigger rmv_legacy_calculate_loan before update on public.loans for each row
 when (old.interest_model<>'upfront_net_v1' and new.interest_model<>'upfront_net_v1')
 execute function public.rmv_calculate_loan();
create trigger rmv_upfront_loan before insert or update on public.loans for each row execute function public.rmv_calculate_upfront_loan();

-- Conservative conversion with per-loan validation. Exceptions retain the original record.
do $$
declare l public.loans; previous_balance bigint; new_balance bigint;
begin
 for l in select * from public.loans where status in ('active','overdue') and interest_type='fixed' and interest_model<>'upfront_net_v1' for update loop
  begin
   previous_balance=l.balance;
   update public.loans set interest_model='upfront_net_v1' where id=l.id returning balance into new_balance;
   insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
   values('LOG-upfront-'||l.id,'system','Loan calculation migration','admin','loan_calculation_migrated','loan',l.id,
    'Applied upfront deduction and default term, preserving credits',jsonb_build_object('previous_balance',previous_balance,'balance',new_balance,'previous_model',l.interest_model),extract(epoch from now())::bigint);
  exception when others then
   raise notice 'Loan % retained for review: %',l.id,sqlerrm;
  end;
 end loop;
end;$$;

alter table public.loan_requests drop constraint if exists loan_requests_repayment_frequency_check;
alter table public.loan_requests add constraint loan_requests_repayment_frequency_check check(repayment_frequency in ('daily','weekly','monthly','yearly'));
-- Normalize submitted terms before existing idempotence and authorization logic.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_loan_request(jsonb,text,text,text)'::regprocedure) into definition;
 definition=replace(definition,'created_customer text;','created_customer text; auto_dates date[];');
 definition=replace(definition,' if action is null or action not in', $normal$
 if action='submit' then
  perform public.rmv_upfront_interest((p_body->>'principal')::bigint,(p_body->>'interest_rate')::double precision);
  auto_dates=public.rmv_upfront_dates((p_body->>'given_date')::date,p_body->>'repayment_frequency');
  p_body=p_body||jsonb_build_object('next_due_date',auto_dates[1],'end_date',auto_dates[cardinality(auto_dates)],'repayment_frequency',case when p_body->>'repayment_frequency'='monthly' then 'yearly' else p_body->>'repayment_frequency' end);
 end if;
 if action is null or action not in$normal$);
 if position('auto_dates date[]' in definition)=0 then raise exception 'Combined approval migration is required first'; end if;
 execute definition;
end;
$migration$;
revoke all on function public.rmv_upfront_interest(bigint,double precision),public.rmv_upfront_dates(date,text),public.rmv_calculate_upfront_loan() from public,anon,authenticated;
grant execute on function public.rmv_upfront_interest(bigint,double precision),public.rmv_upfront_dates(date,text),public.rmv_calculate_upfront_loan() to service_role;
commit;
notify pgrst,'reload schema';

begin;
-- Called inside the existing collection RPC after its FOR UPDATE loan lock.
create or replace function public.rmv_exact_installment(l public.loans)
returns bigint language plpgsql security invoker set search_path=public as $$
declare total bigint; dates date[]; count_dates integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; installment bigint; i integer;
begin
 if l.status in ('closed','foreclosed') or l.balance<=0 then raise exception 'No outstanding installment to collect'; end if;
 if l.interest_model='upfront_net_v1' then
  total=l.principal-public.rmv_upfront_interest(l.principal,l.interest_rate);
  dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency);
 elsif l.interest_model='flat_term_v1' then
  total=l.principal+public.rmv_term_interest(l.principal,l.interest_rate);
  dates=public.rmv_installment_dates(coalesce(l.first_due_date,l.next_due_date),l.end_date,l.repayment_frequency);
 else raise exception 'Loan schedule requires admin review before collection'; end if;
 if l.balance>total then raise exception 'Invalid loan balance'; end if;
 count_dates=cardinality(dates);base=total/count_dates;extra=total%count_dates;credited=total-l.balance;
 for i in 1..count_dates loop
  installment=base+case when i<=extra then 1 else 0 end;
  cumulative=cumulative+installment;
  if cumulative>credited then return least(installment,cumulative-credited); end if;
 end loop;
 raise exception 'No outstanding installment to collect';
end;$$;
revoke all on function public.rmv_exact_installment(public.loans) from public,anon,authenticated;
grant execute on function public.rmv_exact_installment(public.loans) to service_role;
do $migration$
declare definition text; anchor text=$anchor$  sig=nullif(p_receipt->'customer_signature','null'::jsonb);$anchor$;
begin
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Unexpected collection RPC version'; end if;
 definition=replace(definition,anchor,$guard$
  if p_role='agent' and amount_received<>public.rmv_exact_installment(l) then
   raise exception 'Collect exactly ₹% for the next installment. Refresh the loan before retrying.', public.rmv_exact_installment(l);
  end if;
$guard$||anchor);
 execute definition;
end;$migration$;
commit;
notify pgrst,'reload schema';

begin;
alter table public.loans add column if not exists loan_number text;
create unique index loans_display_number_unique on public.loans(upper(coalesce(loan_number,id)));
create or replace function public.rmv_guard_loan_number()
returns trigger language plpgsql security invoker set search_path=public as $$
declare number_text text;
begin
 perform pg_advisory_xact_lock(90817365);
 if tg_table_name='loans' then
  number_text=upper(coalesce(new.loan_number,new.id));
  if new.loan_number is not null and new.loan_number !~ '^[A-Z0-9][A-Z0-9/_-]{0,39}$' then raise exception 'Invalid loan number'; end if;
  if exists(select 1 from public.loans where id<>new.id and (upper(id)=number_text or upper(coalesce(loan_number,id))=number_text or upper(coalesce(loan_number,id))=upper(new.id))) then raise exception 'Loan number already in use'; end if;
 else
  if new.status='pending' and exists(select 1 from public.loans where upper(coalesce(loan_number,id))=upper(new.loan_number)) then raise exception 'Loan number already in use'; end if;
 end if;
 return new;
end;$$;
create trigger rmv_guard_loan_number before insert or update of loan_number on public.loans for each row execute function public.rmv_guard_loan_number();
create trigger rmv_guard_requested_number before insert or update of loan_number on public.loan_requests for each row execute function public.rmv_guard_loan_number();
create or replace function public.rmv_rename_loan_number(p_id text,p_number text,p_event jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare old_number text; number_text text=upper(trim(p_number));
begin
 if p_event->>'actor_role' is distinct from 'admin' or not exists(select 1 from public.users where id=p_event->>'actor_id' and role='admin') then raise exception 'Super admin required'; end if;
 if number_text is null or number_text !~ '^[A-Z0-9][A-Z0-9/_-]{0,39}$' then raise exception 'Invalid loan number'; end if;
 perform pg_advisory_xact_lock(90817365);
 select coalesce(loan_number,id) into old_number from public.loans where id=p_id for update;
 if not found then raise exception 'Loan not found'; end if;
 if exists(select 1 from public.loan_requests where status='pending' and upper(loan_number)=number_text) then raise exception 'Loan number awaiting approval'; end if;
 update public.loans set loan_number=number_text where id=p_id;
 insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event||jsonb_build_object('entity_id',p_id,'metadata',jsonb_build_object('previous_loan_number',old_number,'loan_number',number_text)));
end;$$;
revoke all on function public.rmv_guard_loan_number(),public.rmv_rename_loan_number(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rmv_guard_loan_number(),public.rmv_rename_loan_number(text,text,jsonb) to service_role;
commit;
notify pgrst,'reload schema';

begin;
-- Daily installments cover start date through start + 99 days.
-- Preserve weekly/monthly anchors and existing service-only function grants.
do $migration$
declare definition text; old_expression text='d=start_date+i*(case frequency when ''daily'' then 1 else 7 end);';
begin
 select pg_get_functiondef('public.rmv_upfront_dates(date,text)'::regprocedure) into definition;
 if position(old_expression in definition)=0 then raise exception 'Unexpected upfront date function version'; end if;
 execute replace(definition,old_expression,'d=start_date+(case frequency when ''daily'' then i-1 else i*7 end);');
end;$migration$;
-- Existing calculation trigger refreshes dates/status without changing credits.
update public.loans set next_due_date=next_due_date
where interest_model='upfront_net_v1' and repayment_frequency='daily' and status in ('active','overdue');
update public.loan_requests set next_due_date=given_date,end_date=given_date+99
where repayment_frequency='daily' and status='pending';
commit;
notify pgrst,'reload schema';
