begin;
-- Called inside the existing collection RPC after its FOR UPDATE loan lock.
create or replace function public.rmv_exact_installment(l public.loans)
returns bigint language plpgsql security invoker set search_path=public as $$
declare total bigint; dates date[]; count_dates integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; installment bigint; i integer;
begin
 if l.status in ('closed','foreclosed') or l.balance<=0 then raise exception 'No outstanding installment to collect'; end if;
 if l.interest_model='upfront_net_v1' then
  total=l.principal-public.rmv_upfront_interest(l.principal,l.interest_rate);
  dates=public.rmv_upfront_dates(l.given_date,l.repayment_frequency);
 elsif l.interest_model='flat_term_v1' then
  total=l.principal+public.rmv_term_interest(l.principal,l.interest_rate);
  dates=public.rmv_installment_dates(coalesce(l.first_due_date,l.next_due_date),l.end_date,l.repayment_frequency);
 else raise exception 'Loan schedule requires admin review before collection'; end if;
 if l.balance>total then raise exception 'Invalid loan balance'; end if;
 count_dates=cardinality(dates);base=total/count_dates;extra=total%count_dates;credited=total-l.balance;
 for i in 1..count_dates loop
  installment=base+case when i<=extra then 1 else 0 end;
  cumulative=cumulative+installment;
  if cumulative>credited then return least(installment,cumulative-credited); end if;
 end loop;
 raise exception 'No outstanding installment to collect';
end;$$;
revoke all on function public.rmv_exact_installment(public.loans) from public,anon,authenticated;
grant execute on function public.rmv_exact_installment(public.loans) to service_role;
do $migration$
declare definition text; anchor text=$anchor$  sig=nullif(p_receipt->'customer_signature','null'::jsonb);$anchor$;
begin
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Unexpected collection RPC version'; end if;
 definition=replace(definition,anchor,$guard$
  if p_role='agent' and amount_received<>public.rmv_exact_installment(l) then
   raise exception 'Collect exactly ₹% for the next installment. Refresh the loan before retrying.', public.rmv_exact_installment(l);
  end if;
$guard$||anchor);
 execute definition;
end;$migration$;
commit;
notify pgrst,'reload schema';
