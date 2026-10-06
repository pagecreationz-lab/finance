-- Apply after the existing loan, collection, RBAC and approval migrations.
-- No receipt is rewritten. Existing settled/ambiguous loans remain legacy.
begin;
alter table public.loans add column if not exists interest_model text not null default 'legacy';
alter table public.loans add column if not exists interest_amount bigint;
alter table public.loans add column if not exists first_due_date date;

create or replace function public.rmv_term_interest(p bigint,r double precision)
returns bigint language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
 if p is null or p<=0 or p>9007199254740991 or r is null or r<0 or r>10000 or r='NaN'::double precision or abs(r*10000-round(r*10000))>0.000001 then
   raise exception 'Valid whole-rupee principal and full-term rate (maximum four decimal places) required';
 end if;
 amount=floor((p::numeric*round((r*10000)::numeric)+500000)/1000000);
 if p+amount>9007199254740991 then raise exception 'Total repayable exceeds supported amount'; end if;
 return amount::bigint;
end;$$;

create or replace function public.rmv_installment_dates(first_due date,end_date date,frequency text)
returns date[] language plpgsql immutable set search_path='' as $$
declare dates date[]='{}'; d date; m date; day_no integer=extract(day from first_due)::integer; i integer;
begin
 if first_due is null or end_date is null or first_due>end_date or frequency is null or frequency not in ('daily','weekly','monthly','yearly') then raise exception 'Valid first due date, end date and return basis required'; end if;
 for i in 0..9999 loop
   if frequency in ('daily','weekly') then d=first_due+i*(case when frequency='weekly' then 7 else 1 end);
   else
     m=(date_trunc('month',first_due)+(i*(case when frequency='yearly' then 12 else 1 end))*interval '1 month')::date;
     d=m+least(day_no,extract(day from (m+interval '1 month - 1 day'))::integer)-1;
   end if;
   if d>=end_date then return array_append(dates,end_date); end if;
   dates=array_append(dates,d);
 end loop;
 raise exception 'Loan term cannot exceed 10,000 installments';
end;$$;

create or replace function public.rmv_calculate_loan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare interest bigint; dates date[]; count_dates integer; base bigint; extra bigint; credited bigint; cumulative bigint=0; i integer; next_date date;
begin
 if tg_op='INSERT' then
   if new.interest_type<>'fixed' then raise exception 'New loans require full-term flat interest'; end if;
   new.interest_model='flat_term_v1';new.first_due_date=new.next_due_date;
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   -- All application creation paths supply an untouched principal balance.
   if new.balance<>new.principal then raise exception 'New loans must start with the principal balance'; end if;
   new.balance=new.principal+interest;
 elsif old.interest_model='legacy' and new.interest_model='flat_term_v1' then
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   new.first_due_date=new.next_due_date;new.balance=old.balance+interest;
 elsif old.interest_model='flat_term_v1' then
   if new.interest_model<>old.interest_model or new.interest_type<>old.interest_type then raise exception 'Loan interest model cannot be changed'; end if;
   if old.status in ('closed','foreclosed') and (new.principal,new.interest_rate,new.end_date,new.repayment_frequency,new.next_due_date) is distinct from (old.principal,old.interest_rate,old.end_date,old.repayment_frequency,old.next_due_date) then raise exception 'Closed or foreclosed loan terms cannot be changed'; end if;
   new.first_due_date=case when new.next_due_date is distinct from old.next_due_date then new.next_due_date else old.first_due_date end;
   interest=public.rmv_term_interest(new.principal,new.interest_rate);
   new.balance=new.balance+interest-old.interest_amount+new.principal-old.principal;
 else return new;
 end if;
 new.interest_amount=interest;
 if new.balance<0 or new.balance>new.principal+interest then raise exception 'Balance must be between zero and total repayable'; end if;
 if new.status='foreclosed' then return new; end if;
 if new.given_date is null or new.first_due_date<new.given_date then raise exception 'First due date must be on or after start'; end if;
 dates=public.rmv_installment_dates(new.first_due_date,new.end_date,new.repayment_frequency);
 count_dates=cardinality(dates);base=(new.principal+interest)/count_dates;extra=(new.principal+interest)%count_dates;
 credited=new.principal+interest-new.balance;
 for i in 1..count_dates loop
   cumulative=cumulative+base+case when i<=extra then 1 else 0 end;
   if cumulative>credited then next_date=dates[i];exit;end if;
 end loop;
 new.next_due_date=coalesce(next_date,new.end_date);
 new.status=case when new.balance=0 then 'closed' when new.next_due_date<(now() at time zone 'Asia/Kolkata')::date then 'overdue' else 'active' end;
 return new;
end;$$;
drop trigger if exists rmv_calculate_loan on public.loans;
create trigger rmv_calculate_loan before insert or update on public.loans for each row execute function public.rmv_calculate_loan();

-- Convert only unambiguous open, principal-only balances. Preserve prior credits.
with converted as (
 update public.loans set interest_model='flat_term_v1'
 where interest_model='legacy' and interest_type='fixed' and status in ('active','overdue')
 and principal>0 and balance between 0 and principal and principal<=900719925474
 and interest_rate between 0 and 10000 and abs(interest_rate*10000-round(interest_rate*10000))<=0.000001
 and given_date is not null and end_date is not null and next_due_date between given_date and end_date
 and end_date-next_due_date<=9999 and repayment_frequency in ('daily','weekly','monthly','yearly')
 returning *
)
insert into public.audit_logs(id,actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at)
select 'LOG-flat-term-'||id,'system','Loan calculation migration','admin','loan_calculation_migrated','loan',id,
 'Applied full-term flat interest while preserving existing credits',
 jsonb_build_object('previous_balance',balance-interest_amount,'balance',balance,'interest_amount',interest_amount),extract(epoch from now())::bigint from converted;

revoke all on function public.rmv_term_interest(bigint,double precision),public.rmv_installment_dates(date,date,text),public.rmv_calculate_loan() from public,anon,authenticated;
grant execute on function public.rmv_term_interest(bigint,double precision),public.rmv_installment_dates(date,date,text),public.rmv_calculate_loan() to service_role;
commit;
notify pgrst,'reload schema';
