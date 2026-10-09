begin;
-- Daily installments cover start date through start + 99 days.
-- Preserve weekly/monthly anchors and existing service-only function grants.
do $migration$
declare definition text; old_expression text='d=start_date+i*(case frequency when ''daily'' then 1 else 7 end);';
begin
 select pg_get_functiondef('public.rmv_upfront_dates(date,text)'::regprocedure) into definition;
 if position(old_expression in definition)=0 then raise exception 'Unexpected upfront date function version'; end if;
 execute replace(definition,old_expression,'d=start_date+(case frequency when ''daily'' then i-1 else i*7 end);');
end;$migration$;
-- Existing calculation trigger refreshes dates/status without changing credits.
update public.loans set next_due_date=next_due_date
where interest_model='upfront_net_v1' and repayment_frequency='daily' and status in ('active','overdue');
update public.loan_requests set next_due_date=given_date,end_date=given_date+99
where repayment_frequency='daily' and status='pending';
commit;
notify pgrst,'reload schema';
