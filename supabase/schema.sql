create table if not exists public.users (
  id text primary key,
  name text not null,
  phone text not null,
  email text,
  role text not null,
  assigned_agent_id text references public.users(id) on delete set null,
  created_at bigint not null
);

create table if not exists public.loans (
  id text primary key,
  customer_id text not null references public.users(id) on delete restrict,
  principal bigint not null check (principal > 0),
  balance bigint not null check (balance >= 0),
  interest_type text not null check (interest_type in ('fixed', 'floating')),
  interest_rate double precision not null check (interest_rate >= 0),
  repayment_frequency text not null check (repayment_frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  given_date date not null,
  next_due_date date not null,
  security_type text not null check (security_type in ('asset', 'surety')),
  security_file_key text,
  remarks text,
  status text not null default 'active'
);

create table if not exists public.collections (
  id text primary key,
  loan_id text not null references public.loans(id) on delete restrict,
  agent_id text not null references public.users(id) on delete restrict,
  amount bigint not null check (amount > 0),
  method text not null,
  proof_file_key text,
  remarks text,
  collected_at bigint not null
);

create index if not exists users_role_idx on public.users(role);
create index if not exists users_assigned_agent_idx on public.users(assigned_agent_id);
create index if not exists loans_customer_idx on public.loans(customer_id);
create index if not exists loans_due_date_idx on public.loans(next_due_date);
create index if not exists collections_loan_idx on public.collections(loan_id);
create index if not exists collections_agent_date_idx on public.collections(agent_id, collected_at);

alter table public.users enable row level security;
alter table public.loans enable row level security;
alter table public.collections enable row level security;

insert into storage.buckets (id, name, public)
values ('fundflow-files', 'fundflow-files', false)
on conflict (id) do update set public = false;

insert into public.users (id,name,phone,email,role,assigned_agent_id,created_at) values
  ('agent-deepak','Deepak Singh','+91 98700 12001','deepak@fundflow.local','agent',null,extract(epoch from now())::bigint),
  ('agent-meera','Meera Joshi','+91 98700 12002','meera@fundflow.local','agent',null,extract(epoch from now())::bigint),
  ('agent-akash','Akash Verma','+91 98700 12003','akash@fundflow.local','agent',null,extract(epoch from now())::bigint)
on conflict (id) do nothing;

insert into public.users (id,name,phone,email,role,assigned_agent_id,created_at) values
  ('customer-arjun','Arjun Mehta','+91 98765 43010','arjun@example.com','customer','agent-deepak',extract(epoch from now())::bigint),
  ('customer-priya','Priya Sharma','+91 97654 22981','priya@example.com','customer','agent-meera',extract(epoch from now())::bigint),
  ('customer-ravi','Ravi Kumar','+91 99887 10242','ravi@example.com','customer','agent-deepak',extract(epoch from now())::bigint),
  ('customer-neha','Neha Patel','+91 91234 56908','neha@example.com','customer','agent-meera',extract(epoch from now())::bigint)
on conflict (id) do nothing;

insert into public.loans (id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,security_type,security_file_key,remarks,status) values
  ('LN-2048','customer-arjun',250000,182400,'fixed',16,'weekly','2026-03-12','2026-09-05','asset','Property deed.pdf','Commercial expansion','active'),
  ('LN-2047','customer-priya',120000,84000,'floating',14.5,'monthly','2026-04-20','2026-09-08','asset','Gold valuation.jpg','Working capital','active'),
  ('LN-2046','customer-ravi',400000,344800,'fixed',18,'weekly','2026-02-05','2026-09-02','surety','Surety letter.pdf','Equipment purchase','overdue'),
  ('LN-2045','customer-neha',75000,22500,'fixed',12,'monthly','2026-06-18','2026-09-12','asset','Vehicle RC.jpg','Personal loan','active')
on conflict (id) do nothing;

insert into public.collections (id,loan_id,agent_id,amount,method,proof_file_key,remarks,collected_at) values
  ('RC-8391','LN-2048','agent-deepak',12500,'UPI','payment-proof-RC-8391.jpg','Payment verified',extract(epoch from now())::bigint),
  ('RC-8390','LN-2047','agent-meera',8000,'Cash',null,'Cash receipt recorded',extract(epoch from now())::bigint-1200),
  ('RC-8389','LN-2045','agent-meera',6250,'Bank transfer','payment-proof-RC-8389.jpg','Transfer verified',extract(epoch from now())::bigint-3600)
on conflict (id) do nothing;
