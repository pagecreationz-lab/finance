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
const {upfrontTerms,initializeUpfrontLoan,upfrontCalculation,refreshUpfrontLoan}=require('../lib/upfront-loan.ts');
const approvals=require('../app/api/loan-requests/route.ts');
const RealDate=Date;global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-23T06:00:00Z']))}static now(){return RealDate.parse('2026-11-23T06:00:00Z')}};
(async()=>{
 const admin={id:'super-admin',name:'Admin',role:'admin'},agent={id:'agent-deepak',name:'Agent',role:'agent'},manager={id:'monthly-manager',name:'Manager',role:'manager'};
 async function call(body,actor=admin,api=route){const r=request(body);r.headers.set('cookie',auth.createSessionCookie(actor,new Request('http://localhost')).split(';')[0]);return api.POST(r)}
 assert.deepEqual(upfrontTerms('2026-01-31','monthly','2026-05-15').dates,['2026-02-28','2026-03-31','2026-04-30','2026-05-15']);
 assert.deepEqual(upfrontTerms('2028-01-31','monthly','2028-03-31').dates,['2028-02-29','2028-03-31']);
 assert.deepEqual(upfrontTerms('2026-01-31','monthly','2026-02-10').dates,['2026-02-10']);
 assert.throws(()=>upfrontTerms('2026-01-31','monthly','2026-01-31'));assert.throws(()=>upfrontTerms('2026-01-31','monthly',''));
 assert.equal(upfrontTerms('2026-01-31','daily').dates.length,100);assert.equal(upfrontTerms('2026-01-31','weekly').dates.length,10);assert.equal(upfrontTerms('2026-01-31','yearly').dates.length,12);
 const form={action:'create_loan',loan_number:'MONTH-ADMIN',customer_id:'customer-arjun',principal:10000,interest_rate:10,interest_type:'fixed',repayment_frequency:'monthly',given_date:'2026-08-23',end_date:'2026-12-08',security_type:'asset'};
 let r=await call(form);assert.equal(r.status,200,await r.text());
 let loan=(await store.readLocalStore()).loans.find(l=>l.id==='MONTH-ADMIN');assert.equal(loan.end_date,'2026-12-08');assert.equal(loan.repayment_frequency,'monthly');assert.equal(loan.interest_amount,1000);assert.equal(loan.balance,10000);assert.equal(upfrontCalculation(loan).installment_count,4);
 const pay=amount=>call({action:'create_collection',loan_id:loan.id,amount,method:'Cash'},agent);
 assert.equal((await pay(2500)).status,400);assert.equal((await pay(7500)).status,200);
 loan=(await store.readLocalStore()).loans.find(l=>l.id==='MONTH-ADMIN');assert.equal(loan.balance,2500);assert.equal(loan.next_due_date,'2026-12-08');
 r=await call({...form,loan_number:'BAD',end_date:''});assert.equal(r.status,400);
 await store.mutateLocalStore(d=>d.users.push({...manager,phone:'123',email:null,assigned_agent_id:null,created_at:1}));
 const proposed={...form,action:'submit',id:crypto.randomUUID(),loan_number:'MONTH-AGENT'};
 r=await call(proposed,agent,approvals);assert.equal(r.status,200,await r.text());
 r=await call({action:'approve',id:proposed.id},manager,approvals);assert.equal(r.status,200,await r.text());
 loan=(await store.readLocalStore()).loans.find(l=>l.id==='MONTH-AGENT');assert.equal(loan.end_date,form.end_date);assert.equal(loan.interest_amount,1000);assert.equal(upfrontCalculation(loan).installment_count,4);
 const closed={...loan,status:'closed',balance:0};assert.throws(()=>refreshUpfrontLoan({...closed,end_date:'2027-01-01'},closed),/Settled/);
 console.log('PASS: custom monthly terms, full-term upfront interest, leap/month ends, partial final period, admin creation, agent approval, catch-up amounts, unchanged daily/weekly/legacy yearly.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.Date=RealDate;fs.rmSync(temp,{recursive:true,force:true})});
