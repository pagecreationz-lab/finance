import {AuthError,requireSession,type AppSession} from './auth';
import {hasSupabaseConfig,getSupabaseAdmin} from './supabase-admin';
import {readLocalStore} from './local-data-store';
import {defaultPolicy,validatePolicy,permissionLabels,type Permission,type Policy} from './permissions';
export async function readPolicy():Promise<Policy>{
  if(!hasSupabaseConfig())return (await readLocalStore()).role_permissions||structuredClone(defaultPolicy);
  const r=await getSupabaseAdmin().from('role_permissions').select('policy').eq('id',1).single();
  if(r.error)throw new Error('Access-control database is unavailable. Apply the RBAC migration.');
  return validatePolicy(r.data.policy);
}
export async function access(request:Request):Promise<{session:AppSession;permissions:Permission[]}>{
  const session=requireSession(request);
  if(session.role==='admin')return {session,permissions:Object.keys(permissionLabels) as Permission[]};
  let current;
  if(!hasSupabaseConfig())current=(await readLocalStore()).users.find(u=>u.id===session.id);
  else{const r=await getSupabaseAdmin().from('users').select('id,name,role').eq('id',session.id).maybeSingle();if(r.error)throw new Error('Could not verify current account access');current=r.data}
  if(!current||current.role!==session.role)throw new AuthError('Account access changed. Please sign in again.',401);
  if(session.role==='customer')return {session,permissions:[]};
  return {session:{...session,name:current.name},permissions:(await readPolicy())[session.role]};
}
export function requirePermission(permissions:Permission[],permission:Permission){if(!permissions.includes(permission))throw new AuthError('Access denied: '+permissionLabels[permission],403)}
export const actionPermission:Record<string,Permission>={create_customer:'create_customer',update_customer:'update_customer',delete_customers:'delete_customers',assign_customer:'assign_customer',create_loan:'create_loan',update_loan:'update_loan',create_agent:'create_agent',update_agent:'update_agent',delete_agent:'delete_agent',create_collection:'create_collection'};
