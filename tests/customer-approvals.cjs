const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rmv-approval-test-'));
process.env.FUNDFLOW_LOCAL_DATA_PATH=path.join(temp,'data.json');process.env.FUNDFLOW_SESSION_SECRET='test-only-session-secret';process.env.NODE_ENV='production';
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args)};
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)};
global.fetch=()=>{throw new Error('Network forbidden')};
const api=require('../app/api/customer-requests/route.ts'),dataApi=require('../app/api/data/route.ts'),auth=require('../lib/auth.ts'),store=require('../lib/local-data-store.ts'),{defaultPolicy}=require('../lib/permissions.ts');
const agent={id:'agent-deepak',name:'Agent',role:'agent'},other={id:'agent-meera',name:'Other',role:'agent'},manager={id:'manager-test',name:'Manager',role:'manager'},admin={id:'super-admin',name:'Admin',role:'admin'};
function req(body,actor=agent){return new Request('http://localhost/api/customer-requests',{method:body?'POST':'GET',headers:{'content-type':'application/json',cookie:auth.createSessionCookie(actor,new Request('http://localhost')).split(';')[0]},...(body?{body:JSON.stringify(body)}:{})})}
const submit=(extra={})=>({action:'submit',id:crypto.randomUUID(),name:'Private Applicant',phone:'9876543210',email:'private@example.com',occupation:'Shopkeeper',...extra});
const decision=(id,action='approve')=>({action,id,reason:'Customer identity and application verified'});
(async()=>{
 await store.mutateLocalStore(d=>{d.role_permissions=structuredClone(defaultPolicy);d.users.push({...manager,phone:'',email:null,assigned_agent_id:null,created_at:1})});
 let r=await api.POST(req(submit({occupation:''})));assert.equal(r.status,400);
 const body=submit({agent_id:other.id,assigned_agent_id:other.id,status:'approved',customer_id:'forged'});
 r=await api.POST(req(body));assert.equal(r.status,200);const response=await r.json();assert.equal(response.request.status,'pending');assert.equal(response.request.name,undefined);
 let d=await store.readLocalStore();assert.equal(d.customer_requests[0].agent_id,agent.id);assert.equal(d.users.some(u=>u.name===body.name),false);
 let listing=await(await api.GET(req())).json();assert.deepEqual(Object.keys(listing.requests[0]).sort(),['created_at','id','reviewed_at','status']);assert.ok(!JSON.stringify(listing).includes(body.phone));
 assert.equal((await(await api.GET(req(null,other))).json()).requests.length,0);
 const snapshot=await(await dataApi.GET(req())).json();assert.ok(!JSON.stringify(snapshot).includes(body.name));assert.ok(!JSON.stringify(snapshot).includes(body.email));
 assert.equal((await dataApi.POST(req({action:'create_customer',name:'Bypass',phone:'9876543210',occupation:'Worker'}))).status,403);
 assert.equal((await api.POST(req(decision(body.id)))).status,403);
 assert.equal((await api.POST(req(submit(),manager))).status,403);
 assert.equal((await api.POST(req(body))).status,200);assert.equal((await store.readLocalStore()).customer_requests.length,1);
 assert.equal((await api.POST(req({...body,name:'Changed retry'}))).status,400);
 const managerRows=(await(await api.GET(req(null,manager))).json()).requests;assert.equal(managerRows[0].phone,body.phone);
 const results=await Promise.all([api.POST(req(decision(body.id),manager)),api.POST(req(decision(body.id),manager))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 d=await store.readLocalStore();const created=d.users.filter(u=>u.id==='customer-'+body.id);assert.equal(created.length,1);assert.equal(created[0].assigned_agent_id,agent.id);
 assert.ok((await(await dataApi.GET(req())).json()).customers.some(u=>u.id===created[0].id));
 assert.ok(!(await(await dataApi.GET(req(null,other))).json()).customers.some(u=>u.id===created[0].id));
 const rejected=submit();await api.POST(req(rejected));assert.equal((await api.POST(req(decision(rejected.id,'reject'),manager))).status,200);assert.equal((await api.POST(req(decision(rejected.id),manager))).status,400);
 assert.ok(!(await store.readLocalStore()).users.some(u=>u.id==='customer-'+rejected.id));
 const disabled=submit();await api.POST(req(disabled));await store.mutateLocalStore(d=>{d.users.find(u=>u.id===agent.id).role='archived_agent'});
 assert.equal((await api.POST(req(decision(disabled.id),manager))).status,400);assert.equal((await api.GET(req())).status,401);
 await store.mutateLocalStore(d=>{d.role_permissions.manager=d.role_permissions.manager.filter(p=>p!=='approve_customer');d.role_permissions.agent=d.role_permissions.agent.filter(p=>p!=='submit_customer')});
 assert.equal((await api.GET(req(null,manager))).status,403);assert.equal((await api.POST(req(submit(),other))).status,403);
 assert.equal((await api.POST(req(decision(disabled.id,'reject'),admin))).status,200);
 d=await store.readLocalStore();assert.equal(d.audit_logs.filter(l=>l.action==='customer_approved').length,1);assert.ok(d.audit_logs.some(l=>l.action==='customer_rejected'));
 await store.mutateLocalStore(d=>{d.users.find(u=>u.id===agent.id).role='agent';d.role_permissions=structuredClone(defaultPolicy)});
 for(const action of ['approve','reject'])for(const reason of [undefined,'','   ','OK','x'.repeat(1000)]){
   const p=submit();assert.equal((await api.POST(req(p))).status,200);
   assert.equal((await api.POST(req({action,id:p.id,reason},manager))).status,200);
   const saved=(await store.readLocalStore()).customer_requests.find(r=>r.id===p.id);assert.equal(saved.review_reason,reason?.trim()||null);
 }
 const oversized=submit();await api.POST(req(oversized));assert.equal((await api.POST(req({action:'approve',id:oversized.id,reason:'x'.repeat(1001)},manager))).status,400);
 assert.equal((await store.readLocalStore()).customer_requests.find(r=>r.id===oversized.id).status,'pending');
 console.log('PASS: customer approval security and optional reasons (omitted, blank, whitespace, short, 1,000 characters); excessive length rejected.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('rmv-approval-test-'))fs.rmSync(temp,{recursive:true,force:true})});
