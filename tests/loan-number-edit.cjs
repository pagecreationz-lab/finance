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
 const rename=require('../app/api/loan-number/route.ts');
 async function edit(id,loan_number,actor=admin){const r=request({id,loan_number});r.headers.set('cookie',auth.createSessionCookie(actor,new Request('http://localhost')).split(';')[0]);return rename.POST(r)}
 const before=await store.readLocalStore(),loan=before.loans.find(l=>l.id==='LN-2048');
 assert.equal((await edit(loan.id,'RMV-NEW',agent)).status,403);
 assert.equal((await edit(loan.id,'bad number')).status,400);
 assert.equal((await edit(loan.id,'LN-2047')).status,400);
 assert.equal((await edit(loan.id,'rmv-new')).status,200);
 const after=await store.readLocalStore(),updated=after.loans.find(l=>l.id===loan.id);
 assert.equal(updated.loan_number,'RMV-NEW');assert.equal(updated.balance,loan.balance);assert.deepEqual(after.collections,before.collections);
 assert.equal(after.audit_logs[0].metadata.previous_loan_number,'LN-2048');
 assert.equal((await edit('LN-2047','RMV-NEW')).status,400);
 const response=await route.POST((()=>{const r=request({action:'create_loan',loan_number:'RMV-NEW',customer_id:loan.customer_id,principal:1000,given_date:'2026-10-09',interest_rate:10,repayment_frequency:'daily'});r.headers.set('cookie',auth.createSessionCookie(admin,new Request('http://localhost')).split(';')[0]);return r})());assert.notEqual(response.status,200);
 console.log('PASS: admin number edit, agent denial, invalid/duplicate numbers, audit, stable IDs, receipts and balance.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir()))fs.rmSync(temp,{recursive:true,force:true})});
