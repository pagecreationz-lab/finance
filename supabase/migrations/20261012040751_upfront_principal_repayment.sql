-- Requires upfront terms, exact installments and daily-start migrations.
-- Transaction aborts entirely if any open loan cannot safely preserve its credits.
begin;
do $$begin
 if to_regprocedure('public.rmv_upfront_dates(date,text)') is null or to_regprocedure('public.rmv_exact_installment(public.loans)') is null then
  raise exception 'Missing prerequisites: apply upfront interest and exact-agent-installment migrations first. Do not add columns manually.';
 end if;
 if (public.rmv_upfront_dates('2026-10-09','daily'))[1]<>'2026-10-09'::date then raise exception 'Apply daily_start_date_installment migration first'; end if;
 if exists(select 1 from public.loans where status in ('active','overdue') and interest_type<>'fixed') then raise exception 'Open non-fixed loans require explicit rate review before conversion'; end if;
end;$$;
create or replace function public.rmv_calculate_upfront_loan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare interest bigint; total bigint; old_total bigint; dates date[]; n integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; i integer; due date;
begin
 if tg_op='UPDATE' and old.interest_model not in ('upfront_net_v1','upfront_principal_v2') and new.interest_model not in ('upfront_net_v1','upfront_principal_v2') then return new; end if;
 if new.interest_type<>'fixed' then raise exception 'New loans require upfront fixed-rate deduction'; end if;
 interest=public.rmv_upfront_interest(new.principal,new.interest_rate);total=new.principal-case when tg_op='UPDATE' and new.interest_model='upfront_net_v1' then interest else 0 end;
 dates=public.rmv_upfront_dates(new.given_date,new.repayment_frequency);
 if tg_op='INSERT' then
  if new.balance<>new.principal then raise exception 'New loans must start with untouched lending amount'; end if;
  new.balance=total;new.interest_model='upfront_principal_v2';
 elsif old.interest_model=new.interest_model and old.interest_model in ('upfront_net_v1','upfront_principal_v2') then
  if new.interest_model<>old.interest_model then raise exception 'Interest model cannot be changed'; end if;
  if old.status in ('closed','foreclosed') and (new.principal,new.interest_rate,new.given_date,new.repayment_frequency) is distinct from (old.principal,old.interest_rate,old.given_date,old.repayment_frequency) then raise exception 'Settled loan terms cannot be changed'; end if;
  new.balance=new.balance+total-(old.principal-case when old.interest_model='upfront_net_v1' then old.interest_amount else 0 end);
 else
  old_total=old.principal+case when old.interest_model='flat_term_v1' then coalesce(old.interest_amount,0) when old.interest_model='upfront_net_v1' then -coalesce(old.interest_amount,0) else 0 end;
  if old.status not in ('active','overdue') or old.balance>old_total then raise exception 'Loan needs manual review before conversion'; end if;
  new.balance=total-(old_total-old.balance);
 end if;
 if new.balance<0 or new.balance>total then raise exception 'Revised total is below existing credits or balance'; end if;
 new.interest_amount=interest;new.first_due_date=dates[1];new.end_date=dates[cardinality(dates)];
 if new.repayment_frequency='monthly' then new.repayment_frequency='yearly'; end if;
 if new.status='foreclosed' then return new; end if;
 n=cardinality(dates);base=total/n;extra=total%n;credited=total-new.balance;
 for i in 1..n loop
  cumulative=cumulative+base+case when i<=extra then 1 else 0 end;
  if cumulative>credited then due=dates[i];exit;end if;
 end loop;
 new.next_due_date=coalesce(due,new.end_date);
 new.status=case when new.balance=0 then 'closed' when new.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end;
 return new;
end;$$;

drop trigger if exists rmv_legacy_calculate_loan on public.loans;
create trigger rmv_legacy_calculate_loan before update on public.loans for each row
 when (old.interest_model not in ('upfront_net_v1','upfront_principal_v2') and new.interest_model not in ('upfront_net_v1','upfront_principal_v2')) execute function public.rmv_calculate_loan();
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_exact_installment(public.loans)'::regprocedure) into definition;
 if position('upfront_principal_v2' in definition)=0 then
  if position('if l.interest_model=''upfront_net_v1'' then' in definition)=0 then raise exception 'Unexpected installment function version'; end if;
  definition=replace(definition,'if l.interest_model=''upfront_net_v1'' then',
   'if l.interest_model=''upfront_principal_v2'' then total=l.principal; dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency); elsif l.interest_model=''upfront_net_v1'' then');
  execute definition;
 end if;
end;$migration$;
do $$declare l public.loans; revised public.loans;
begin
 for l in select * from public.loans where status in ('active','overdue') and interest_model<>'upfront_principal_v2' for update loop
  update public.loans set interest_model='upfront_principal_v2' where id=l.id returning * into revised;
  insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
  values('LOG-principal-v2-'||l.id,'system','Repayment model migration','admin','loan_calculation_migrated','loan',l.id,'Full principal repayment; existing credits preserved',jsonb_build_object('previous_loan',to_jsonb(l),'balance',revised.balance,'total_repayable',revised.principal),extract(epoch from now())::bigint);
 end loop;
end;$$;
revoke all on function public.rmv_calculate_upfront_loan() from public,anon,authenticated;
grant execute on function public.rmv_calculate_upfront_loan() to service_role;
commit;
notify pgrst,'reload schema';
