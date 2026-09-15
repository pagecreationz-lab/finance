begin;
alter table public.loans add column if not exists foreclosed_at bigint;
alter table public.loans add column if not exists foreclosure_amount bigint;
alter table public.loans add column if not exists foreclosure_waived bigint;
alter table public.loans add column if not exists foreclosure_proof_file_key text;
alter table public.loans add column if not exists foreclosure_remarks text;
alter table public.loans add column if not exists foreclosed_by text;
commit;