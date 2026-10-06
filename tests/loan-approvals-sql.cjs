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
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006123141_agent_loan_approval.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006125754_flat_term_loan_calculation.sql'),'utf8'));await db.exec('set role service_role');
 const call=async(body,actor='agent',role='agent')=>(await db.query('select public.rmv_loan_request($1::jsonb,$2,$3,$4) as result',[JSON.stringify(body),actor,actor,role])).rows[0].result;
 const b={action:'submit',id:crypto.randomUUID(),customer_id:'customer',principal:30000,interest_type:'fixed',interest_rate:12,repayment_frequency:'daily',given_date:'2026-10-06',next_due_date:'2026-10-07',end_date:'2026-12-06',security_type:'asset',remarks:null};
 await assert.rejects(call({...b,customer_id:'foreign'}));await assert.rejects(call({...b,principal:1.5}));await assert.rejects(call({...b,next_due_date:'2027-01-01'}));
 assert.equal((await call(b)).status,'pending');await call(b);assert.equal((await db.query('select count(*)::int n from public.loans')).rows[0].n,0);
 const decide={action:'approve',id:b.id};await assert.rejects(call(decide));assert.equal((await call(decide,'manager','manager')).status,'approved');await assert.rejects(call(decide,'manager','manager'));
 let loans=(await db.query('select * from public.loans')).rows;assert.equal(loans.length,1);assert.equal(Number(loans[0].balance),33600);assert.equal(loans[0].customer_id,'customer');
 const rejected={...b,id:crypto.randomUUID()};await call(rejected);await call({action:'reject',id:rejected.id},'manager','manager');await assert.rejects(call({...decide,id:rejected.id},'manager','manager'));
 const pending={...b,id:crypto.randomUUID()};await call(pending);await db.exec("update public.users set assigned_agent_id='other' where id='customer'");await assert.rejects(call({...decide,id:pending.id},'manager','manager'));
 await db.exec("update public.users set assigned_agent_id='agent' where id='customer';update public.users set role='archived_agent' where id='agent'");await assert.rejects(call({...decide,id:pending.id},'manager','manager'));
 assert.equal((await db.query('select count(*)::int n from public.loans')).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from public.audit_logs where action='loan_approved'")).rows[0].n,1);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.loan_requests'));await assert.rejects(db.query("select public.rmv_loan_request('{}','a','a','admin')"));
 console.log('PASS: PostgreSQL loan approval, eligibility rechecks, validated terms, pending isolation, repeat protection, optional reasons, audit and public-role denial.');
 }finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
