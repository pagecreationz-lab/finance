-- Read only. Send the result before running migrations if any value is false.
select
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='loans' and column_name='interest_model') as has_interest_model,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='loan_requests' and column_name='new_customer') as has_combined_approval,
 to_regprocedure('public.rmv_upfront_dates(date,text)') is not null as has_upfront_dates,
 to_regprocedure('public.rmv_exact_installment(public.loans)') is not null as has_exact_installments,
 coalesce(position('then i-1' in pg_get_functiondef(to_regprocedure('public.rmv_upfront_dates(date,text)')))>0,false) as has_daily_start_rule;
