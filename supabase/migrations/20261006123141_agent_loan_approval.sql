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
