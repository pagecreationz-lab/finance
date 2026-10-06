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
 reason_text text=trim(p_body->>'reason'); actor_role text; actor_name text; policy jsonb;
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
   if reason_text is null or length(reason_text) not between 10 and 1000 then raise exception 'Valid review reason required'; end if;
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
