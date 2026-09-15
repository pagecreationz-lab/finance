begin;
alter table public.loans add column if not exists foreclosed_at bigint;
alter table public.loans add column if not exists foreclosure_amount bigint;
alter table public.loans add column if not exists foreclosure_waived bigint;
alter table public.loans add column if not exists foreclosure_proof_file_key text;
alter table public.loans add column if not exists foreclosure_remarks text;
alter table public.loans add column if not exists foreclosed_by text;

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

commit;
