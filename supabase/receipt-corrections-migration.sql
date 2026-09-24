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
