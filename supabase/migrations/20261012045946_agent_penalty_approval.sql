begin;
-- Prerequisites: full-principal repayment, exact installments, and receipt corrections.
do $$ begin
 if to_regprocedure('public.rmv_exact_installment(public.loans)') is null or to_regclass('public.receipt_corrections') is null then raise exception 'Apply the previous loan-calculation and receipt-correction migrations first'; end if;
end $$;
alter table public.collections add column if not exists penalty_amount bigint not null default 0 check(penalty_amount>=0 and penalty_amount<=amount);
create table public.penalty_requests(
 id text primary key,loan_id text not null references public.loans(id),amount bigint not null check(amount>0 and amount<=100000000),
 missed_dates date[] not null check(cardinality(missed_dates) between 1 and 100),reason text not null default '' check(length(reason)<=1000),
 requested_by text not null references public.users(id),requested_name text not null,created_at bigint not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','collected')),
 reviewed_by text,reviewed_name text,reviewed_at bigint,receipt_id text references public.collections(id),
 check((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null)),
 check((status='collected')=(receipt_id is not null))
);
create index penalty_loan_status on public.penalty_requests(loan_id,status);
create index penalty_agent_created on public.penalty_requests(requested_by,created_at desc);
alter table public.penalty_requests enable row level security;
revoke all on public.penalty_requests from public,anon,authenticated;
grant select,insert,update on public.penalty_requests to service_role;

create or replace function public.rmv_penalty_dates(l public.loans) returns date[] language plpgsql security invoker set search_path='' as $$
declare dates date[]; result date[]='{}'; total bigint; base bigint; extra bigint; cumulative bigint=0; i integer;
begin
 if l.interest_model is distinct from 'upfront_principal_v2' or l.repayment_frequency<>'daily' or l.status not in ('active','overdue') or l.balance<=0 then return result; end if;
 dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency);total=l.principal;base=total/100;extra=total%100;
 for i in 1..100 loop
  cumulative=cumulative+base+case when i<=extra then 1 else 0 end;
  if dates[i]<(now() at time zone 'Asia/Kolkata')::date and cumulative>total-l.balance and (base+case when i<=extra then 1 else 0 end)>0 then result=array_append(result,dates[i]);end if;
 end loop;return result;
end $$;
revoke all on function public.rmv_penalty_dates(public.loans) from public,anon,authenticated;
grant execute on function public.rmv_penalty_dates(public.loans) to service_role;

create or replace function public.rmv_penalty_request(p_body jsonb,p_actor text,p_name text,p_role text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.loans;r public.penalty_requests;action text=p_body->>'action';policy jsonb;dates date[];stamp bigint=extract(epoch from now())::bigint;actor_name text;
begin
 if p_role is null or p_role not in ('admin','manager','agent') or action is null or action not in ('request','approve','reject') then raise exception 'Forbidden';end if;
 if p_role<>'admin' then
  select name into actor_name from public.users where id=p_actor and role=p_role;if not found then raise exception 'Account no longer active';end if;
  select rp.policy into policy from public.role_permissions rp where id=1;
  if not coalesce(policy->p_role ? 'collections',false) or not coalesce(policy->p_role ? 'loans',false) or (action='request' and not coalesce(policy->p_role ? 'create_collection',false)) then raise exception 'Permission denied';end if;
 else actor_name=p_name;end if;
 if action='request' then
  if p_role<>'agent' then raise exception 'Only agents enter penalties';end if;
  select * into l from public.loans where id=p_body->>'loan_id' for update;
 else
  if p_role not in ('admin','manager') then raise exception 'Admin Manager or Super Admin approval required';end if;
  select * into l from public.loans where id=(select loan_id from public.penalty_requests where id=p_body->>'id') for update;
 end if;
 if not found then raise exception 'Loan not found';end if;
 if action='request' then
  if not exists(select 1 from public.users where id=l.customer_id and role='customer' and assigned_agent_id=p_actor) then raise exception 'Loan not assigned to you';end if;
  select array_agg(value::date order by value) into dates from jsonb_array_elements_text(p_body->'missed_dates');
  if dates is null or cardinality(dates)=0 or not dates<@public.rmv_penalty_dates(l) or cardinality(dates)<>(select count(distinct d) from unnest(dates) d) then raise exception 'Choose overdue unpaid dates on an open 100-day daily loan';end if;
  if exists(select 1 from public.penalty_requests where loan_id=l.id and status<>'rejected' and missed_dates&&dates) then raise exception 'A penalty already exists for these dates';end if;
  if (p_body->>'amount')::numeric<>trunc((p_body->>'amount')::numeric) then raise exception 'Whole rupees required';end if;
  insert into public.penalty_requests(id,loan_id,amount,missed_dates,reason,requested_by,requested_name,created_at)
  values(p_body->>'id',l.id,(p_body->>'amount')::bigint,dates,coalesce(p_body->>'reason',''),p_actor,actor_name,stamp) returning * into r;
 else
  select * into r from public.penalty_requests where id=p_body->>'id' for update;
  if r.status is distinct from 'pending' then raise exception 'Pending request not found';end if;
  if r.requested_by=p_actor then raise exception 'Cannot review own request';end if;
  if action='approve' and (not r.missed_dates<@public.rmv_penalty_dates(l) or not exists(select 1 from public.users where id=l.customer_id and assigned_agent_id=r.requested_by) or not exists(select 1 from public.users where id=r.requested_by and role='agent')) then raise exception 'Loan, assignment or installments changed. Reject this request';end if;
  update public.penalty_requests set status=case when action='approve' then 'approved' else 'rejected' end,reviewed_by=p_actor,reviewed_name=actor_name,reviewed_at=stamp where id=r.id returning * into r;
 end if;
 insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
 values('LOG-'||gen_random_uuid(),p_actor,actor_name,p_role,'penalty_'||case when action='request' then 'requested' else r.status end,'penalty',r.id,'Penalty '||r.status,to_jsonb(r),stamp);
 return to_jsonb(r);
end $$;
revoke all on function public.rmv_penalty_request(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.rmv_penalty_request(jsonb,text,text,text) to service_role;

create or replace function public.rmv_record_collection(p_receipt jsonb,p_actor text,p_role text,p_event jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.loans;amount_received bigint;penalty bigint;installment bigint;sig jsonb;policy jsonb;
begin
 if p_role is null or p_role not in ('admin','agent','manager') then raise exception 'Forbidden';end if;
 if p_role<>'admin' then
  if not exists(select 1 from public.users where id=p_actor and role=p_role) then raise exception 'Account no longer active';end if;
  select rp.policy into policy from public.role_permissions rp where id=1;
  if not coalesce(policy->p_role ? 'create_collection',false) then raise exception 'Permission denied';end if;
 end if;
 select * into l from public.loans where id=p_receipt->>'loan_id' for update;
 if not found then raise exception 'Loan not found';end if;
 if l.status in ('closed','foreclosed') then raise exception 'Loan is closed';end if;
 if p_role='agent' and not exists(select 1 from public.users where id=l.customer_id and assigned_agent_id=p_actor) then raise exception 'Customer is not assigned to this agent';end if;
 select coalesce(sum(amount),0) into penalty from public.penalty_requests where loan_id=l.id and status='approved';
 if (p_receipt->>'amount')::numeric<>trunc((p_receipt->>'amount')::numeric) then raise exception 'Whole rupees required';end if;
 amount_received=(p_receipt->>'amount')::bigint;
 if amount_received is null or amount_received<=penalty or amount_received>l.balance+penalty then raise exception 'Invalid collection amount';end if;
 installment=amount_received-penalty;
 if (p_role='agent' or penalty>0) and installment<>public.rmv_exact_installment(l) then raise exception 'Collect exactly ₹% including approved penalty. Refresh before retrying.',public.rmv_exact_installment(l)+penalty;end if;
 sig=nullif(p_receipt->'customer_signature','null'::jsonb);
 insert into public.collections(id,loan_id,agent_id,amount,penalty_amount,method,proof_file_key,remarks,collected_at,customer_signature,signature_at,collected_by_name)
 values(p_receipt->>'id',l.id,case when p_role='agent' then p_actor else null end,amount_received,penalty,p_receipt->>'method',nullif(p_receipt->>'proof_file_key',''),nullif(p_receipt->>'remarks',''),(p_receipt->>'collected_at')::bigint,sig,case when sig is not null then (p_receipt->>'collected_at')::bigint else null end,p_receipt->>'collected_by_name');
 update public.penalty_requests set status='collected',receipt_id=p_receipt->>'id' where loan_id=l.id and status='approved';
 update public.loans set balance=balance-installment,status=case when balance-installment=0 then 'closed' else status end where id=l.id;
 p_event=jsonb_set(p_event,'{metadata}',coalesce(p_event->'metadata','{}'::jsonb)||jsonb_build_object('penalty_amount',penalty,'installment_amount',installment));
 insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end $$;
revoke all on function public.rmv_record_collection(jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rmv_record_collection(jsonb,text,text,jsonb) to service_role;

-- Append the new column to the existing view without changing existing column order.
do $$ declare definition text;begin
 select pg_get_viewdef('public.collection_ledger'::regclass,true) into definition;
 execute 'create or replace view public.collection_ledger with (security_invoker=true) as select v.*,c.penalty_amount from ('||rtrim(definition,E';\n ')||') v join public.collections c on c.id=v.id';
end $$;
revoke all on public.collection_ledger from public,anon,authenticated;
grant select on public.collection_ledger to service_role;

create or replace function public.rmv_penalty_safety() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='loans' then
  if (new.balance<=0 or new.status in ('closed','foreclosed')) and exists(select 1 from public.penalty_requests where loan_id=new.id and status='approved') then raise exception 'Collect approved penalties before closing the loan';end if;
  if new.status='foreclosed' and exists(select 1 from public.penalty_requests where loan_id=new.id and status='pending') then raise exception 'Resolve pending penalties before foreclosure';end if;
 elsif TG_TABLE_NAME='receipt_corrections' then
  if new.after_amount<(select penalty_amount from public.collections where id=new.receipt_id) then raise exception 'Cannot reverse an approved penalty; correct only the installment portion';end if;
 elsif TG_TABLE_NAME='collections' then
  if old.penalty_amount>0 and new is distinct from old then raise exception 'Penalty receipts are immutable; use receipt corrections';end if;
 end if;return new;
end $$;
create trigger rmv_penalty_close_guard before update on public.loans for each row execute function public.rmv_penalty_safety();
create trigger rmv_penalty_correction_guard before insert or update on public.receipt_corrections for each row execute function public.rmv_penalty_safety();
create trigger rmv_penalty_receipt_guard before update on public.collections for each row execute function public.rmv_penalty_safety();
revoke all on function public.rmv_penalty_safety() from public,anon,authenticated;
commit;
notify pgrst,'reload schema';
