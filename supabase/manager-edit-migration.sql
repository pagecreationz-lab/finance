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
