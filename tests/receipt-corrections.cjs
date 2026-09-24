// Isolated temporary store. No production data or external network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rmv-correction-test-'));
process.env.FUNDFLOW_LOCAL_DATA_PATH=path.join(temp,'data.json');process.env.FUNDFLOW_SESSION_SECRET='test-only-session-secret';
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args)};
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)};
global.fetch=()=>{throw new Error('Network forbidden')};
const route=require('../app/api/receipt-corrections/route.ts'),dataRoute=require('../app/api/data/route.ts'),auth=require('../lib/auth.ts'),store=require('../lib/local-data-store.ts'),{effectiveCollections}=require('../lib/receipt-corrections.ts'),{defaultPolicy}=require('../lib/permissions.ts'),{receiptHtml}=require('../lib/receipt-download.ts'),{collectionLedger}=require('../lib/collection-records.ts');
const admin={id:'super-admin',name:'Admin',role:'admin'},manager={id:'manager-test',name:'Manager',role:'manager'},agent={id:'agent-deepak',name:'Agent',role:'agent'};
function request(body,actor=admin){return new Request('http://localhost/api/receipt-corrections',{method:body?'POST':'GET',headers:{'content-type':'application/json',cookie:auth.createSessionCookie(actor,new Request('http://localhost')).split(';')[0]},...(body?{body:JSON.stringify(body)}:{})})}
const call=(body,actor)=>route.POST(request(body,actor));
const proposal=(amount,before=12500,revision=null)=>({action:'request',id:crypto.randomUUID(),receipt_id:'RC-8391',amount,before_amount:before,base_revision:revision,reason:'Correct amount after checking cash register'});
(async()=>{
 await store.mutateLocalStore(d=>{d.users.push({...manager,phone:'123',email:null,assigned_agent_id:null,created_at:1});d.role_permissions=structuredClone(defaultPolicy);d.collections[0].customer_signature=[[[0,0],[.1,.1],[.2,.2],[.3,.3],[.4,.4]]];});
 const original=await store.readLocalStore(),balance=original.loans[0].balance;
 const p=proposal(12000);
 assert.equal((await call(p,agent)).status,403);
 assert.equal((await call({...p,reason:'short'},manager)).status,400);
 assert.equal((await call(p,manager)).status,200);
 let d=await store.readLocalStore();assert.equal(d.loans[0].balance,balance);assert.equal(effectiveCollections(d.collections,d.receipt_corrections)[0].amount,12500);
 const decision={action:'approve',id:p.id,reason:'Verified against the original cash register'};
 assert.equal((await call(decision,manager)).status,403);
 assert.equal((await call(decision)).status,200);
 assert.equal((await call(decision)).status,400);
 d=await store.readLocalStore();assert.equal(d.loans[0].balance,balance+500);assert.deepEqual(d.collections,original.collections);
 assert.equal((await call(p,manager)).status,200);assert.equal((await store.readLocalStore()).loans[0].balance,balance+500);
 const stale=proposal(11000,12000,p.id);assert.equal((await call(stale,manager)).status,200);
 const direct=proposal(11500,12000,p.id);assert.equal((await call(direct)).status,200);
 assert.equal((await call({...decision,id:stale.id})).status,400);
 assert.equal((await call({...decision,action:'reject',id:stale.id})).status,200);
 d=await store.readLocalStore();assert.equal(d.loans[0].balance,balance+1000);
 const beforeInvalid=JSON.stringify(d);assert.equal((await call(proposal(99999999,11500,direct.id))).status,400);assert.equal(JSON.stringify(await store.readLocalStore()),beforeInvalid);
 const snapshot=await(await dataRoute.GET(request())).json();const corrected=snapshot.collections.find(r=>r.id==='RC-8391');assert.equal(corrected.amount,11500);assert.equal(corrected.original_amount,12500);
 for(const frequency of ['daily','weekly','monthly']){const rows=collectionLedger(snapshot.collections,frequency,'2026-09');assert.equal(rows.reduce((s,r)=>s+r.amount,0),25750)}
 const html=receiptHtml(corrected);assert.ok(html.includes('Original payment amount'));assert.ok(html.includes('12,500'));assert.ok(html.includes('11,500'));assert.ok(html.includes('signature belongs to the original payment'));
 const scoped=await(await dataRoute.GET(request(null,agent))).json();assert.equal(scoped.collections.find(r=>r.id==='RC-8391').amount,11500);assert.ok(!scoped.collections.some(r=>r.id==='RC-8390'));
 await store.mutateLocalStore(d=>{d.loans[0].balance=0;d.loans[0].status='closed';d.users.find(u=>u.id===d.loans[0].customer_id).role='archived_customer'});
 assert.equal((await call(proposal(0,11500,direct.id))).status,200);d=await store.readLocalStore();assert.equal(d.loans[0].balance,11500);assert.notEqual(d.loans[0].status,'closed');assert.equal(d.users.find(u=>u.id===d.loans[0].customer_id).role,'customer');
 await store.mutateLocalStore(d=>{d.role_permissions.manager=d.role_permissions.manager.filter(p=>p!=='request_correction');d.loans[0].status='foreclosed'});
 assert.equal((await call(proposal(10),manager)).status,403);assert.equal((await route.GET(request(null,agent))).status,403);
 const latest=effectiveCollections(d.collections,d.receipt_corrections)[0];assert.equal((await call(proposal(10,0,latest.correction_id))).status,400);
 d=await store.readLocalStore();assert.ok(d.audit_logs.some(r=>r.action==='receipt_correction_approved'));assert.ok(d.audit_logs.some(r=>r.action==='receipt_correction_rejected'));assert.deepEqual(d.collections,original.collections);
 console.log('PASS: corrections, approval RBAC, immutable signed originals, balance recalculation, stale/repeated requests, rejection, reversal, overpayment rollback, ledger totals, scoped reads, downloads and audit events.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('rmv-correction-test-'))fs.rmSync(temp,{recursive:true,force:true})});
