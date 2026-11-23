begin;
-- No balance, receipt, approval or historical schedule is rewritten.
create or replace function public.rmv_due_through_today(l public.loans)
returns bigint language plpgsql security invoker set search_path='' as $$
declare total bigint;dates date[];base bigint;extra bigint;credited bigint;cumulative bigint=0;
 installment bigint;due bigint=0;i integer;n integer;today date=(now() at time zone 'Asia/Kolkata')::date;
begin
 if l.status in ('closed','foreclosed') or l.balance<=0 then return 0;end if;
 if l.interest_model='upfront_principal_v2' then total=l.principal;dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency);
 elsif l.interest_model='upfront_net_v1' then total=l.principal-public.rmv_upfront_interest(l.principal,l.interest_rate);dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency);
 elsif l.interest_model='flat_term_v1' then total=l.principal+public.rmv_term_interest(l.principal,l.interest_rate);dates=public.rmv_installment_dates(coalesce(l.first_due_date,l.next_due_date),l.end_date,l.repayment_frequency);
 else raise exception 'Loan schedule requires admin review before collection';end if;
 if l.balance>total then raise exception 'Invalid loan balance';end if;
 n=cardinality(dates);base=total/n;extra=total%n;credited=total-l.balance;
 for i in 1..n loop
  installment=base+case when i<=extra then 1 else 0 end;
  if dates[i]<=today then due=due+greatest(0,installment-least(installment,greatest(0,credited-cumulative)));end if;
  cumulative=cumulative+installment;
 end loop;
 return due;
end $$;
revoke all on function public.rmv_due_through_today(public.loans) from public,anon,authenticated;
grant execute on function public.rmv_due_through_today(public.loans) to service_role;

-- Keep the existing loan lock, assignment/RBAC checks and atomic penalty allocation.
do $migration$
declare definition text;
begin
 if to_regclass('public.penalty_requests') is null then raise exception 'Apply agent penalty approval first';end if;
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 if position('public.rmv_due_through_today(l)' in definition)>0 then return;end if;
 if position('public.rmv_exact_installment(l)' in definition)=0 or position('penalty>0' in definition)=0 then raise exception 'Unexpected collection function. Apply agent penalty approval first';end if;
 definition=replace(definition,'public.rmv_exact_installment(l)','public.rmv_due_through_today(l)');
 definition=replace(definition,'including approved penalty. Refresh before retrying.','for all unpaid installments due through today plus approved penalty. Refresh before retrying.');
 execute definition;
end $migration$;
commit;
notify pgrst,'reload schema';
