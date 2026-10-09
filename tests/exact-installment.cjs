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
 const created=await call({action:'create_customer',name:'Exact',phone:'1234567890',occupation:'Test',agent_id:agent.id});assert.equal(created.status,200);
 const customer=(await store.readLocalStore()).users.find(u=>u.name==='Exact');
 for(const [basis,amount] of [['daily',90],['weekly',900],['yearly',750]]){
  const id='EXACT-'+basis.toUpperCase();
  const response=await call({action:'create_loan',loan_number:id,customer_id:customer.id,principal:10000,interest_type:'fixed',interest_rate:10,repayment_frequency:basis,given_date:'2026-10-08'});assert.equal(response.status,200,await response.text());
  const pay=amount=>call({action:'create_collection',loan_id:id,amount,method:'Cash'},agent);
  assert.equal((await pay(amount-1)).status,400);assert.equal((await pay(amount+1)).status,400);
  assert.equal((await store.readLocalStore()).loans.find(l=>l.id===id).balance,9000);
  assert.equal((await pay(amount)).status,200);
  assert.equal((await store.readLocalStore()).loans.find(l=>l.id===id).balance,9000-amount);
 }
 console.log('PASS: local agent API rejects under/overpayments and accepts exact daily/weekly/monthly installments.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true})});
