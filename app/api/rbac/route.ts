import {requireAdmin,requireSession,hashPassword,AuthError} from '@/lib/auth';
import {readPolicy} from '@/lib/rbac';
import {validatePolicy} from '@/lib/permissions';
import {readLocalStore,mutateLocalStore} from '@/lib/local-data-store';
import {hasSupabaseConfig,getSupabaseAdmin} from '@/lib/supabase-admin';
import {createAuditLog} from '@/lib/audit-log';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Access-control request failed'},{status:e instanceof AuthError?e.status:400});
export async function GET(request:Request){try{
 const session=requireSession(request);requireAdmin(session);
 const policy=await readPolicy();
 let managers;
 if(!hasSupabaseConfig())managers=(await readLocalStore()).users.filter(u=>['manager','archived_manager'].includes(u.role)).map(({id,name,username,role,phone})=>({id,name,username,role,phone}));
 else{const r=await getSupabaseAdmin().from('users').select('id,name,username,role,phone').in('role',['manager','archived_manager']);if(r.error)throw new Error(r.error.message);managers=r.data}
 return Response.json({policy,managers},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const session=requireSession(request);requireAdmin(session);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError('Invalid origin',403);
 const body=await request.json(),now=Math.floor(Date.now()/1000);
 if(body.action==='policy'){
   const policy=validatePolicy(body.policy),event=createAuditLog(session,'change_permissions',{policy},now);
   if(!hasSupabaseConfig())await mutateLocalStore(data=>{data.role_permissions=policy;data.audit_logs.unshift(event)});
   else{const r=await getSupabaseAdmin().rpc('rmv_save_permissions',{p_policy:policy,p_event:event});if(r.error)throw new Error(r.error.message)}
 }else if(body.action==='create_manager'){
   const name=String(body.name||'').trim(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
   if(!name||name.length>100||!/^[a-z0-9._-]{3,60}$/.test(username)||password.length<10||password.length>256)throw new Error('Name, username (3–60 letters/numbers/._-) and a password of 10–256 characters are required.');
   const row={id:'manager-'+crypto.randomUUID(),name,username,password_hash:hashPassword(password),role:'manager',phone:String(body.phone||'').slice(0,30),email:null,assigned_agent_id:null,created_at:now};
   const event=createAuditLog(session,'manage_manager',{id:row.id,name,activity:'Created manager account'},now);
   if(!hasSupabaseConfig())await mutateLocalStore(data=>{if(data.users.some(u=>u.username?.toLowerCase()===username))throw new Error('Username already exists');data.users.push(row);data.audit_logs.unshift(event)});
   else{const r=await getSupabaseAdmin().rpc('rmv_manage_manager',{p_user:row,p_event:event,p_create:true});if(r.error)throw new Error(r.error.message)}
 }else if(body.action==='update_manager'||body.action==='delete_manager'){
   const id=String(body.id||''),deleting=body.action==='delete_manager';
   const name=String(body.name||'').trim(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
   if(!id)throw new Error('Manager ID is required');
   if(!deleting&&(!name||name.length>100||!/^[a-z0-9._-]{3,60}$/.test(username)||(password!==''&&(password.length<10||password.length>256))))throw new Error('Valid name, username and optional password (10–256 characters) are required.');
   const changes={id,name,username,...(password&&!deleting?{password_hash:hashPassword(password)}:{})};
   const event=createAuditLog(session,'manage_manager',{id,name,activity:deleting?'Deleted manager account':'Updated manager account',username:deleting?undefined:username,password_changed:!deleting&&Boolean(password)},now);
   if(!hasSupabaseConfig())await mutateLocalStore(data=>{const user=data.users.find(u=>u.id===id&&['manager','archived_manager'].includes(u.role));if(!user)throw new Error('Manager not found');
     if(deleting){user.role='deleted_manager';user.password_hash=null;}else{if(data.users.some(u=>u.id!==id&&u.username?.toLowerCase()===username))throw new Error('Username already exists');Object.assign(user,changes)}data.audit_logs.unshift(event);
   });
   else{const r=await getSupabaseAdmin().rpc('rmv_edit_manager',{p_user:changes,p_event:event,p_delete:deleting});if(r.error)throw new Error(r.error.message)}
 }else if(body.action==='manager_status'){
   if(typeof body.enabled!=='boolean')throw new Error('Invalid account status');
   const id=String(body.id||''),role=body.enabled?'manager':'archived_manager',event=createAuditLog(session,'manage_manager',{id,activity:body.enabled?'Enabled manager account':'Disabled manager account'},now);
   if(!hasSupabaseConfig())await mutateLocalStore(data=>{const user=data.users.find(u=>u.id===id&&['manager','archived_manager'].includes(u.role));if(!user)throw new Error('Manager not found');user.role=role;data.audit_logs.unshift(event)});
   else{const r=await getSupabaseAdmin().rpc('rmv_manage_manager',{p_user:{id,role},p_event:event,p_create:false});if(r.error)throw new Error(r.error.message)}
 }else throw new Error('Unknown access-control action');
 return Response.json({ok:true});
}catch(e){return fail(e)}}
