// In-memory PostgreSQL. argv[2] points to an isolated @electric-sql/pglite install.
const {PGlite}=require(process.argv[2]),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.users(id text primary key,name text not null,phone text,email text,occupation text,role text not null,assigned_agent_id text references public.users(id),created_at bigint);
 create table public.audit_logs(id text primary key,actor_id text,actor_name text,actor_role text,action text,entity_type text,entity_id text,summary text,metadata jsonb,created_at bigint);
 create table public.role_permissions(id int primary key,policy jsonb);
 insert into public.users(id,name,role)values('agent','Agent','agent'),('other','Other agent','agent'),('manager','Manager','manager');
 insert into public.users(id,name,role,assigned_agent_id)values('customer','Borrower','customer','agent'),('foreign','Foreign','customer','other');
 insert into public.role_permissions values(1,'{"agent":["customers","loans"],"manager":["customers","loans"]}');`);
 const schema=fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8');
 await db.exec(schema.match(/create table if not exists public.loans \([\s\S]*?\);/)[0]);
 await db.exec('alter table public.loans add column end_date date; grant all on public.users,public.loans,public.audit_logs,public.role_permissions to service_role;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006123141_agent_loan_approval.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006125754_flat_term_loan_calculation.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261008095251_combined_customer_loan_approval.sql'),'utf8'));await db.exec('set role service_role');
 const call=async(body,actor='agent',role='agent')=>(await db.query('select public.rmv_loan_request($1::jsonb,$2,$3,$4) as result',[JSON.stringify(body),actor,actor,role])).rows[0].result;
 await db.exec('reset role');
 await db.query('update public.role_permissions set policy=$1::jsonb',[JSON.stringify({agent:['customers','loans','submit_customer','submit_loan'],manager:['customers','loans','approve_customer','approve_loan']})]);
 await db.exec('set role service_role');
 await db.exec("insert into public.loans(id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,end_date,security_type,status) values('old','customer',10000,10000,'fixed',10,'daily','2026-10-08','2026-10-09','2027-10-08','asset','active');update public.loans set balance=10500 where id='old'");
 await db.exec('reset role');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261008110332_upfront_interest_default_terms.sql'),'utf8'));
 await db.exec('set role service_role');
 assert.equal(Number((await db.query("select balance from loans where id='old'")).rows[0].balance),8500);
 const date=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
 const make=(basis)=>({action:'submit',id:crypto.randomUUID(),loan_number:'NEW-'+basis.toUpperCase(),customer_id:'customer',principal:10000,interest_type:'fixed',interest_rate:10,repayment_frequency:basis,given_date:'2026-10-08',next_due_date:'2099-01-01',end_date:'2099-12-31',security_type:'asset',remarks:null});
 for(const [basis,end,first] of [['daily','2027-01-16','2026-10-09'],['weekly','2026-12-17','2026-10-15'],['yearly','2027-10-08','2026-11-08']]){
  const b=make(basis);let r=await call(b);await call(b);
  assert.equal(r.end_date,end);assert.equal(r.next_due_date,first);
  await call({action:'approve',id:b.id},'manager','manager');
  const l=(await db.query('select * from loans where id=$1',[b.loan_number])).rows[0];
  assert.equal(Number(l.balance),9000);assert.equal(Number(l.interest_amount),1000);assert.equal(date(l.end_date),end);assert.equal(date(l.next_due_date),first);
 }
 await db.exec("update loans set balance=balance-90 where id='NEW-DAILY'");
 assert.equal(date((await db.query("select next_due_date from loans where id='NEW-DAILY'")).rows[0].next_due_date),'2026-10-10');
 await db.exec("update loans set balance=balance+1 where id='NEW-DAILY'");
 assert.equal(date((await db.query("select next_due_date from loans where id='NEW-DAILY'")).rows[0].next_due_date),'2026-10-09');
 await db.exec("update loans set interest_rate=15 where id='NEW-DAILY'");
 assert.equal(Number((await db.query("select balance from loans where id='NEW-DAILY'")).rows[0].balance),8411);
 const dates=(await db.query("select public.rmv_upfront_dates('2028-01-31','yearly') as dates")).rows[0].dates.map(date);
 assert.deepEqual(dates.slice(0,3),['2028-02-29','2028-03-31','2028-04-30']);assert.equal(dates.length,12);
 const invalid={...make('daily'),id:crypto.randomUUID(),loan_number:'INVALID',interest_rate:100};await assert.rejects(call(invalid));
 await db.exec('reset role');
 await db.exec(`create table collections(id text primary key,loan_id text,agent_id text,amount bigint,method text,proof_file_key text,remarks text,collected_at bigint,customer_signature jsonb,signature_at bigint,collected_by_name text);grant all on collections to service_role;`);
 await db.exec(schema.match(/create or replace function public.rmv_record_collection\(p_receipt[\s\S]*?grant execute on function public.rmv_record_collection[\s\S]*?;/)[0]);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261008084928_optional_agent_signature.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261009120605_exact_agent_installments.sql'),'utf8'));
 await db.exec('set role service_role');
 const receipt=async(loan,amount,actor='agent')=>db.query('select rmv_record_collection($1::jsonb,$2,$3,$4::jsonb)',[JSON.stringify({id:crypto.randomUUID(),loan_id:loan,amount,method:'Cash',collected_at:1,collected_by_name:'Agent'}),actor,'agent',JSON.stringify({id:crypto.randomUUID()})]);
 for(const [loan,amount] of [['NEW-DAILY',81],['NEW-WEEKLY',900],['NEW-YEARLY',750]]){
  const before=Number((await db.query('select balance from loans where id=$1',[loan])).rows[0].balance);
  await assert.rejects(receipt(loan,amount-1),/Collect exactly/);await assert.rejects(receipt(loan,amount+1),/Collect exactly/);
  await assert.rejects(receipt(loan,amount,'other'),/not assigned/);
  assert.equal(Number((await db.query('select balance from loans where id=$1',[loan])).rows[0].balance),before);
  await receipt(loan,amount);
  assert.equal(Number((await db.query('select balance from loans where id=$1',[loan])).rows[0].balance),before-amount);
 }
 assert.equal(Number((await db.query('select count(*) as n from collections')).rows[0].n),3);
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select rmv_exact_installment(l) from loans l limit 1"));
 console.log('PASS: exact installment SQL RPC: daily/weekly/monthly, partial remainder, under/overpayment rollback, assignments and permissions.');
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select public.rmv_upfront_interest(10000,10)"));
 console.log('PASS: PostgreSQL upfront terms, approval normalization/idempotence, credit-preserving migration, 100/10/12 schedules, payments/reversals/rate edits, calendar boundaries and grants.');
 }finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});

