// Isolated login regression tests. No production database or network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'fundflow-login-test-'));
process.env.FUNDFLOW_LOCAL_DATA_PATH=path.join(temp,'data.json');process.env.FUNDFLOW_SESSION_SECRET='test-only-session-secret';process.env.FUNDFLOW_ADMIN_USER=' admin ';process.env.FUNDFLOW_ADMIN_PASSWORD='test-only-password';process.env.NODE_ENV='production';
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args)};
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)};
global.fetch=()=>{throw new Error('Network forbidden in test')};
const route=require('../app/api/data/route.ts'),auth=require('../lib/auth.ts'),store=require('../lib/local-data-store.ts'),db=require('../lib/supabase-admin.ts');
const request=body=>new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 const admin={id:'super-admin',name:'Admin',role:'admin'},agent={id:'agent-deepak',name:'Agent',role:'agent'};
 async function call(body,actor=admin){const r=request(body);r.headers.set('cookie',auth.createSessionCookie(actor,new Request('http://localhost')).split(';')[0]);return route.POST(r)}
 const edit={action:'update_loan',id:'LN-2048',interest_rate:16,next_due_date:'2026-10-01',end_date:'2027-05-09',remarks:'Test',repayment_frequency:'daily'};
 assert.equal((await call(edit,agent)).status,403);
 assert.equal((await call({...edit,repayment_frequency:'invalid'})).status,400);
 assert.equal((await call(edit)).status,200);
 let data=await store.readLocalStore();assert.equal(data.loans.find(x=>x.id==='LN-2048').repayment_frequency,'daily');assert.ok(data.audit_logs.some(x=>x.action==='update_loan'&&x.metadata.repayment_frequency==='daily'));
 assert.equal((await call({action:'assign_customer',customer_id:'customer-arjun',agent_id:'agent-meera'})).status,200);
 data=await store.readLocalStore();assert.equal(data.users.find(x=>x.id==='customer-arjun').assigned_agent_id,'agent-meera');
 const r=new Request('http://localhost/api/data',{headers:{cookie:auth.createSessionCookie(admin,new Request('http://localhost')).split(';')[0]}});const snapshot=await (await route.GET(r)).json();const loan=snapshot.loans.find(x=>x.id==='LN-2048');assert.equal(loan.assigned_agent_id,'agent-meera');assert.equal(loan.agent_name,'Meera Joshi');
 assert.equal((await call({action:'assign_customer',customer_id:'customer-arjun',agent_id:'does-not-exist'})).status,404);
 console.log('PASS: admin-only loan edits, return-basis validation/persistence/audit, agent assignment and refreshed loan agent details.');})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('fundflow-login-test-'))fs.rmSync(temp,{recursive:true,force:true})});