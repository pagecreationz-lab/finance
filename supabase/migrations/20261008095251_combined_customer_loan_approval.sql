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
