-- Apply to existing installations before deploying the matching application.
-- Existing rows remain nullable; no occupations, dates or signatures are fabricated.
begin;
alter table public.users add column if not exists occupation text;
alter table public.loans add column if not exists end_date date;
alter table public.collections add column if not exists customer_signature jsonb;
alter table public.collections add column if not exists signature_at bigint;

create or replace function public.rmv_protect_signed_receipt() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.customer_signature is not null then
    raise exception 'Signed receipts cannot be edited or deleted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists rmv_signed_receipt_guard on public.collections;
create trigger rmv_signed_receipt_guard before update or delete on public.collections
for each row execute function public.rmv_protect_signed_receipt();
alter table public.collections add column if not exists collected_by_name text;
alter table public.collections alter column agent_id drop not null;
create or replace function public.rmv_record_collection(p_receipt jsonb, p_actor text, p_role text, p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l public.loans; amount_received bigint; sig jsonb;
begin
  if p_role not in ('admin','agent') then raise exception 'Forbidden'; end if;
  select * into l from public.loans where id=p_receipt->>'loan_id' for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status in ('closed','foreclosed') then raise exception 'Loan is closed'; end if;
  if p_role='agent' and not exists(select 1 from public.users where id=l.customer_id and assigned_agent_id=p_actor) then
    raise exception 'Customer is not assigned to this agent';
  end if;
  amount_received=(p_receipt->>'amount')::bigint;
  if amount_received is null or amount_received<=0 or amount_received>l.balance then raise exception 'Invalid collection amount'; end if;
  sig=nullif(p_receipt->'customer_signature','null'::jsonb);
  if p_role='agent' and (sig is null or jsonb_typeof(sig)<>'array' or jsonb_array_length(sig)=0) then raise exception 'Customer signature required'; end if;
  insert into public.collections(id,loan_id,agent_id,amount,method,proof_file_key,remarks,collected_at,customer_signature,signature_at,collected_by_name)
  values(p_receipt->>'id',l.id,case when p_role='agent' then p_actor else null end,amount_received,p_receipt->>'method',nullif(p_receipt->>'proof_file_key',''),nullif(p_receipt->>'remarks',''),(p_receipt->>'collected_at')::bigint,sig,case when sig is not null then (p_receipt->>'collected_at')::bigint else null end,p_receipt->>'collected_by_name');
  update public.loans set balance=balance-amount_received,status=case when balance-amount_received=0 then 'closed' else status end where id=l.id;
  insert into public.audit_logs select * from jsonb_populate_record(null::public.audit_logs,p_event);
end;
$$;
revoke all on function public.rmv_record_collection(jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rmv_record_collection(jsonb,text,text,jsonb) to service_role;
commit;
notify pgrst, 'reload schema';
