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