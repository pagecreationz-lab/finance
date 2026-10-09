-- Run after combined customer/loan approval. Receipts remain immutable.
begin;
create or replace function public.rmv_upfront_interest(p bigint,r double precision)
returns bigint language plpgsql immutable set search_path='' as $$
declare interest numeric;
begin
 if p is null or p<=0 or p>9007199254740991 or r is null or r<0 or r>=100 or r='NaN'::double precision or abs(r*10000-round(r*10000))>0.000001 then raise exception 'Valid lending amount and upfront rate below 100%% required'; end if;
 interest=floor((p::numeric*round((r*10000)::numeric)+500000)/1000000);
 if interest>=p then raise exception 'Remaining repayable amount must be positive'; end if;
 return interest::bigint;
end;$$;
create or replace function public.rmv_upfront_dates(start_date date,frequency text)
returns date[] language plpgsql immutable set search_path='' as $$
declare dates date[]='{}'; i integer; n integer; m date; d date;
begin
 if start_date is null or start_date<'1900-01-01' or frequency is null or frequency not in ('daily','weekly','monthly','yearly') then raise exception 'Valid start date and loan type required'; end if;
 n=case frequency when 'daily' then 100 when 'weekly' then 10 else 12 end;
 for i in 1..n loop
  if frequency in ('daily','weekly') then d=start_date+i*(case frequency when 'daily' then 1 else 7 end);
  else
   m=(date_trunc('month',start_date)+i*interval '1 month')::date;
   d=m+least(extract(day from start_date)::integer,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
  end if;
  if d>'9999-12-31' then raise exception 'End date outside supported range'; end if;
  dates=array_append(dates,d);
 end loop;
 return dates;
end;$$;
create or replace function public.rmv_calculate_upfront_loan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare interest bigint; total bigint; old_total bigint; dates date[]; n integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; i integer; due date;
begin
 if tg_op='UPDATE' and old.interest_model<>'upfront_net_v1' and new.interest_model<>'upfront_net_v1' then return new; end if;
 if new.interest_type<>'fixed' then raise exception 'New loans require upfront fixed-rate deduction'; end if;
 interest=public.rmv_upfront_interest(new.principal,new.interest_rate);total=new.principal-interest;
 dates=public.rmv_upfront_dates(new.given_date,new.repayment_frequency);
 if tg_op='INSERT' then
  if new.balance<>new.principal then raise exception 'New loans must start with untouched lending amount'; end if;
  new.balance=total;new.interest_model='upfront_net_v1';
 elsif old.interest_model='upfront_net_v1' then
  if new.interest_model<>old.interest_model then raise exception 'Interest model cannot be changed'; end if;
  if old.status in ('closed','foreclosed') and (new.principal,new.interest_rate,new.given_date,new.repayment_frequency) is distinct from (old.principal,old.interest_rate,old.given_date,old.repayment_frequency) then raise exception 'Settled loan terms cannot be changed'; end if;
  new.balance=new.balance+total-(old.principal-old.interest_amount);
 else
  old_total=old.principal+case when old.interest_model='flat_term_v1' then coalesce(old.interest_amount,0) else 0 end;
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
drop trigger if exists rmv_calculate_loan on public.loans;
-- Retain historical calculations for skipped/settled old-model loans.
create trigger rmv_legacy_calculate_loan before update on public.loans for each row
 when (old.interest_model<>'upfront_net_v1' and new.interest_model<>'upfront_net_v1')
 execute function public.rmv_calculate_loan();
create trigger rmv_upfront_loan before insert or update on public.loans for each row execute function public.rmv_calculate_upfront_loan();

-- Conservative conversion with per-loan validation. Exceptions retain the original record.
do $$
declare l public.loans; previous_balance bigint; new_balance bigint;
begin
 for l in select * from public.loans where status in ('active','overdue') and interest_type='fixed' and interest_model<>'upfront_net_v1' for update loop
  begin
   previous_balance=l.balance;
   update public.loans set interest_model='upfront_net_v1' where id=l.id returning balance into new_balance;
   insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
   values('LOG-upfront-'||l.id,'system','Loan calculation migration','admin','loan_calculation_migrated','loan',l.id,
    'Applied upfront deduction and default term, preserving credits',jsonb_build_object('previous_balance',previous_balance,'balance',new_balance,'previous_model',l.interest_model),extract(epoch from now())::bigint);
  exception when others then
   raise notice 'Loan % retained for review: %',l.id,sqlerrm;
  end;
 end loop;
end;$$;

alter table public.loan_requests drop constraint if exists loan_requests_repayment_frequency_check;
alter table public.loan_requests add constraint loan_requests_repayment_frequency_check check(repayment_frequency in ('daily','weekly','monthly','yearly'));
-- Normalize submitted terms before existing idempotence and authorization logic.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_loan_request(jsonb,text,text,text)'::regprocedure) into definition;
 definition=replace(definition,'created_customer text;','created_customer text; auto_dates date[];');
 definition=replace(definition,' if action is null or action not in', $normal$
 if action='submit' then
  perform public.rmv_upfront_interest((p_body->>'principal')::bigint,(p_body->>'interest_rate')::double precision);
  auto_dates=public.rmv_upfront_dates((p_body->>'given_date')::date,p_body->>'repayment_frequency');
  p_body=p_body||jsonb_build_object('next_due_date',auto_dates[1],'end_date',auto_dates[cardinality(auto_dates)],'repayment_frequency',case when p_body->>'repayment_frequency'='monthly' then 'yearly' else p_body->>'repayment_frequency' end);
 end if;
 if action is null or action not in$normal$);
 if position('auto_dates date[]' in definition)=0 then raise exception 'Combined approval migration is required first'; end if;
 execute definition;
end;
$migration$;
revoke all on function public.rmv_upfront_interest(bigint,double precision),public.rmv_upfront_dates(date,text),public.rmv_calculate_upfront_loan() from public,anon,authenticated;
grant execute on function public.rmv_upfront_interest(bigint,double precision),public.rmv_upfront_dates(date,text),public.rmv_calculate_upfront_loan() to service_role;
commit;
notify pgrst,'reload schema';
