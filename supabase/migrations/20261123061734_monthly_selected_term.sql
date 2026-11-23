begin;
-- Preserve historical yearly (12-month) schedules; new monthly loans use an explicit end date.
create or replace function public.rmv_loan_dates(start_date date,frequency text,end_date date)
returns date[] language plpgsql immutable security invoker set search_path='' as $$
declare dates date[]='{}';m date;d date;i integer;day_no integer=extract(day from start_date)::integer;
begin
 if frequency<>'monthly' then return public.rmv_upfront_dates(start_date,frequency);end if;
 if start_date is null or start_date<date '1900-01-01' or end_date is null or end_date<=start_date then raise exception 'Monthly loans require a start date and an end date after the start date';end if;
 for i in 1..1200 loop
  m=(date_trunc('month',start_date)+i*interval '1 month')::date;
  d=m+least(day_no,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
  if d>=end_date then return array_append(dates,end_date);end if;
  dates=array_append(dates,d);
 end loop;
 raise exception 'Monthly loans cannot exceed 1,200 collection periods';
end $$;
revoke all on function public.rmv_loan_dates(date,text,date) from public,anon,authenticated;
grant execute on function public.rmv_loan_dates(date,text,date) to service_role;

do $migration$
declare definition text;signature text;
begin
 foreach signature in array array['public.rmv_calculate_upfront_loan()','public.rmv_exact_installment(public.loans)','public.rmv_due_through_today(public.loans)','public.rmv_loan_request(jsonb,text,text,text)'] loop
  if to_regprocedure(signature) is null then raise exception 'Missing prerequisite: %. Apply existing repayment, approval and catch-up migrations first.',signature;end if;
  select pg_get_functiondef(to_regprocedure(signature)) into definition;
  if position('public.rmv_loan_dates(' in definition)>0 then continue;end if;
  if position('public.rmv_upfront_dates(' in definition)=0 then raise exception 'Unexpected function version: %',signature;end if;
  definition=replace(definition,'public.rmv_upfront_dates(new.given_date,new.repayment_frequency)','public.rmv_loan_dates(new.given_date,new.repayment_frequency,new.end_date)');
  definition=replace(definition,'public.rmv_upfront_dates(l.given_date,l.repayment_frequency)','public.rmv_loan_dates(l.given_date,l.repayment_frequency,l.end_date)');
  definition=replace(definition,'public.rmv_upfront_dates((p_body->>''given_date'')::date,p_body->>''repayment_frequency'')','public.rmv_loan_dates((p_body->>''given_date'')::date,p_body->>''repayment_frequency'',(p_body->>''end_date'')::date)');
  definition=replace(definition,'if new.repayment_frequency=''monthly'' then new.repayment_frequency=''yearly''; end if;','-- Monthly frequency and the selected end date are retained.');
  definition=replace(definition,'case when p_body->>''repayment_frequency''=''monthly'' then ''yearly'' else p_body->>''repayment_frequency'' end','p_body->>''repayment_frequency''');
  definition=replace(definition,'(new.principal,new.interest_rate,new.given_date,new.repayment_frequency) is distinct from (old.principal,old.interest_rate,old.given_date,old.repayment_frequency)','(new.principal,new.interest_rate,new.given_date,new.repayment_frequency,new.end_date) is distinct from (old.principal,old.interest_rate,old.given_date,old.repayment_frequency,old.end_date)');
  if position('public.rmv_loan_dates(' in definition)=0 then raise exception 'Unable to upgrade schedule function: %',signature;end if;
  execute definition;
 end loop;
end $migration$;
-- No UPDATE of loans, requests, collections or balances: existing records are untouched.
commit;
notify pgrst,'reload schema';
