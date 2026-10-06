// Supply a temporary installation path for @electric-sql/pglite as argv[2].
// In-memory PostgreSQL only; no remote project connections.
const {PGlite}=require(process.argv[2]),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.users(id text primary key,name text not null,phone text not null,email text,occupation text,role text not null,assigned_agent_id text references public.users(id),created_at bigint);
 create table public.audit_logs(id text primary key,actor_id text,actor_name text,actor_role text constraint audit_logs_actor_role_check check(actor_role in ('admin','agent')),action text,entity_type text,entity_id text,summary text,metadata jsonb,created_at bigint);
 create table public.role_permissions(id int primary key,policy jsonb);
 grant all on public.users,public.audit_logs,public.role_permissions to service_role;
 insert into public.users(id,name,phone,role)values('agent','Agent','123','agent'),('manager','Manager','456','manager');
 insert into public.role_permissions values(1,'{"agent":["customers"],"manager":["customers"]}');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006103723_agent_customer_approval.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006122441_optional_customer_review_reason.sql'),'utf8'));
 await db.exec('set role service_role');
 const call=async(body,actor='agent',role='agent')=>(await db.query('select public.rmv_customer_request($1::jsonb,$2,$3,$4) as result',[JSON.stringify(body),actor,actor,role])).rows[0].result;
 const b={action:'submit',id:crypto.randomUUID(),name:'Applicant',phone:'9876543210',occupation:'Worker',email:null};
 assert.equal((await call(b)).status,'pending');await call(b);
 assert.equal((await db.query('select count(*)::int n from public.customer_requests')).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from public.users where role='customer'")).rows[0].n,0);
 const decide={action:'approve',id:b.id,reason:'Checked original identity documents'};
 await assert.rejects(call(decide));assert.equal((await call(decide,'manager','manager')).status,'approved');
 await assert.rejects(call(decide,'manager','manager'));
 assert.equal((await db.query("select assigned_agent_id from public.users where role='customer'")).rows[0].assigned_agent_id,'agent');
 assert.equal((await db.query("select count(*)::int n from public.audit_logs where action='customer_approved'")).rows[0].n,1);
 const rejected={...b,id:crypto.randomUUID()};await call(rejected);await call({...decide,id:rejected.id,action:'reject'},'manager','manager');await assert.rejects(call({...decide,id:rejected.id},'manager','manager'));
 const pending={...b,id:crypto.randomUUID()};await call(pending);
 await db.exec("update public.users set role='archived_agent' where id='agent'");
 await assert.rejects(call({...decide,id:pending.id},'manager','manager'));
 assert.equal((await db.query('select status from public.customer_requests where id=$1',[pending.id])).rows[0].status,'pending');
 await db.exec("update public.users set role='agent' where id='agent'");
 for(const action of ['approve','reject'])for(const reason of [undefined,'','   ','OK','x'.repeat(1000)]){
   const p={...b,id:crypto.randomUUID()};await call(p);
   const result=await call({action,id:p.id,reason},'manager','manager');assert.equal(result.review_reason,reason?.trim()||null);
   assert.equal((await db.query('select count(*)::int n from public.audit_logs where entity_id=$1',[p.id])).rows[0].n,2);
 }
 const oversized={...b,id:crypto.randomUUID()};await call(oversized);await assert.rejects(call({...decide,id:oversized.id,reason:'x'.repeat(1001)},'manager','manager'));
 await db.exec('reset role; set role anon');await assert.rejects(db.query('select * from public.customer_requests'));await assert.rejects(db.query("select public.rmv_customer_request('{}','a','a','admin')"));
 console.log('PASS: PostgreSQL migration, atomic approval and audit, repeat protection, rejection, inactive agents and public-role denial.');
 }finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
