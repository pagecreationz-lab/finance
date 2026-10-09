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
