// Isolated login regression tests. No production database or network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'fundflow-login-test-'));
process.env.FUNDFLOW_LOCAL_DATA_PATH=path.join(temp,'data.json');process.env.FUNDFLOW_SESSION_SECRET='test-only-session-secret';process.env.FUNDFLOW_ADMIN_USER=' admin ';process.env.FUNDFLOW_ADMIN_PASSWORD='test-only-password';process.env.NODE_ENV='production';
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args)};
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)};
global.fetch=()=>{throw new Error('Network forbidden in test')};
const route=require('../app/api/auth/login/route.ts'),auth=require('../lib/auth.ts'),store=require('../lib/local-data-store.ts'),db=require('../lib/supabase-admin.ts');
const request=body=>new Request('http://localhost/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 let result=await route.POST(request(null));assert.equal(result.status,400);
 result=await route.POST(request({username:'admin',password:'wrong'}));assert.equal(result.status,401);assert.equal(result.headers.get('www-authenticate'),null);assert.equal(result.headers.get('set-cookie'),null);
 result=await route.POST(request({username:'admin',password:'test-only-password'}));assert.equal(result.status,200);assert.equal(result.headers.get('www-authenticate'),null);assert.equal(result.headers.get('cache-control'),'no-store');const cookie=result.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.equal(auth.readSession(new Request('http://localhost',{headers:{cookie}})).role,'admin');
 await store.mutateLocalStore(data=>data.users.push({id:'stored-admin',name:'Owner',role:'admin',phone:'',email:null,assigned_agent_id:null,created_at:1,username:'owner',password_hash:auth.hashPassword('new-owner-password')}));
 result=await route.POST(request({username:'admin',password:'test-only-password'}));assert.equal(result.status,401,'Bootstrap credentials must not override stored admin');
 result=await route.POST(request({username:'owner',password:'new-owner-password'}));assert.equal(result.status,200);
 const secure=auth.createSessionCookie({id:'owner',name:'Owner',role:'admin'},new Request('https://example.test'));assert.ok(secure.includes('; Secure'));
 db.hasSupabaseConfig=()=>true;let code='PGRST204';db.getSupabaseAdmin=()=>({from:()=>{const q={select:()=>q,eq:()=>q,in:()=>q,limit:()=>q,abortSignal:()=>q,maybeSingle:async()=>({error:{code,message:'password_hash missing'}}),then:(resolve)=>Promise.resolve({data:[]}).then(resolve)};return q}});
 result=await route.POST(request({username:'admin',password:'test-only-password'}));assert.equal(result.status,503);assert.match((await result.json()).error,/migration/);assert.equal(result.headers.get('set-cookie'),null);
 code='401';result=await route.POST(request({username:'admin',password:'test-only-password'}));assert.equal(result.status,503);assert.match((await result.json()).error,/Supabase/);assert.equal(result.headers.get('www-authenticate'),null);
 console.log('PASS: form validation, invalid credentials, bootstrap login, stored-admin precedence, secure signed cookies, migration/configuration failures, no authentication bypass and no HTTP Basic challenges.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('fundflow-login-test-'))fs.rmSync(temp,{recursive:true,force:true})});