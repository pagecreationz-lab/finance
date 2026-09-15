import { createSessionCookie, hashPassword, requireAdmin, requireSession, verifyPassword, verifyPlainCredential } from '@/lib/auth';
import { getSupabaseAdmin, hasSupabaseConfig } from '@/lib/supabase-admin';
import { mutateLocalStore, readLocalStore, type StoredUser } from '@/lib/local-data-store';
import { appendAuditLog } from '@/lib/audit-log';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const localRequest=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);
const useLocal=(request:Request)=>!hasSupabaseConfig()&&(process.env.NODE_ENV!=='production'||localRequest(request));
const publicProfile=(row:StoredUser|undefined,session:{name:string})=>({name:row?.name||session.name,username:row?.username||process.env.FUNDFLOW_ADMIN_USER||'admin'});
const errorStatus=(error:unknown)=>typeof error==='object'&&error&&'status' in error?Number(error.status):500;

export async function GET(request:Request){
  try{
    const session=requireSession(request);requireAdmin(session);
    let admin:StoredUser|undefined;
    if(useLocal(request))admin=(await readLocalStore()).users.find(user=>user.role==='admin');
    else{
      const result=await getSupabaseAdmin().from('users').select('*').eq('role','admin').limit(1).maybeSingle();
      if(result.error)throw new Error(result.error.message);admin=result.data as StoredUser|undefined;
    }
    return Response.json({profile:publicProfile(admin,session)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not load profile'},{status:errorStatus(error)});}
}

export async function POST(request:Request){
  try{
    const session=requireSession(request);requireAdmin(session);
    const body=await request.json() as {name?:string;username?:string;currentPassword?:string;newPassword?:string};
    const name=String(body.name||'').trim(),username=String(body.username||'').trim().toLowerCase(),currentPassword=String(body.currentPassword||''),newPassword=String(body.newPassword||'');
    if(!name||!username||!currentPassword)return Response.json({error:'Name, username and current password are required'},{status:400});
    if(newPassword&&newPassword.length<8)return Response.json({error:'New password must contain at least 8 characters'},{status:400});
    let existing:StoredUser|undefined;
    if(useLocal(request))existing=(await readLocalStore()).users.find(user=>user.role==='admin');
    else{
      const result=await getSupabaseAdmin().from('users').select('*').eq('role','admin').limit(1).maybeSingle();
      if(result.error)throw new Error(result.error.message);existing=result.data as StoredUser|undefined;
    }
    const bootstrapPassword=process.env.FUNDFLOW_ADMIN_PASSWORD||(process.env.NODE_ENV!=='production'?'FundFlow@123':'');
    const valid=existing?verifyPassword(currentPassword,existing.password_hash):verifyPlainCredential(currentPassword,bootstrapPassword);
    if(!valid)return Response.json({error:'Current password is incorrect'},{status:401});
    const passwordHash=newPassword?hashPassword(newPassword):existing?.password_hash||hashPassword(currentPassword);
    const row:StoredUser={id:existing?.id||'super-admin',name,phone:existing?.phone||'',email:existing?.email||null,role:'admin',assigned_agent_id:null,created_at:existing?.created_at||Math.floor(Date.now()/1000),username,password_hash:passwordHash};
    if(useLocal(request))await mutateLocalStore(data=>{if(data.users.some(user=>user.id!==row.id&&user.username?.toLowerCase()===username))throw new Error('Username is already in use');const index=data.users.findIndex(user=>user.role==='admin');if(index>=0)data.users[index]=row;else data.users.push(row);});
    else{
      const db=getSupabaseAdmin(),duplicate=await db.from('users').select('id').eq('username',username).neq('id',row.id).limit(1);
      if(duplicate.error)throw new Error(duplicate.error.message);if(duplicate.data?.length)return Response.json({error:'Username is already in use'},{status:409});
      const saved=await db.from('users').upsert(row,{onConflict:'id'});if(saved.error)throw new Error(saved.error.message);
    }
    await appendAuditLog(request,session,'update_admin_profile',{id:row.id,name,username,password_changed:Boolean(newPassword)});
    const user={id:row.id,name:row.name,role:'admin' as const};
    return Response.json({user,profile:publicProfile(row,user)},{headers:{'Set-Cookie':createSessionCookie(user,request),'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Profile update failed'},{status:errorStatus(error)});}
}