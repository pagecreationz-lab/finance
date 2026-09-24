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
