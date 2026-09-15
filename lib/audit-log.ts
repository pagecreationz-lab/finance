import { getSupabaseAdmin, hasSupabaseConfig } from '@/lib/supabase-admin';
import { mutateLocalStore, type StoredAuditLog } from '@/lib/local-data-store';
import type { AppSession } from '@/lib/auth';

export type AuditAction =
  | 'reminder_settings' | 'reminder_consent' | 'reminder_attempt' | 'reminder_result'
  | 'create_customer' | 'update_customer' | 'delete_customers' | 'assign_customer'
  | 'create_loan' | 'update_loan' | 'foreclose_loan' | 'reopen_loan'
  | 'create_collection' | 'update_collection'
  | 'create_agent' | 'update_agent' | 'delete_agent'
  | 'update_admin_profile' | 'update_branding' | 'sign_in' | 'sign_out' | 'upload_proof' | 'view_proof' | 'ui_activity';

const labels:Record<AuditAction,string>={reminder_settings:'Requested reminder configuration update',reminder_consent:'Requested reminder consent update',reminder_attempt:'Submitted reminder attempt',reminder_result:'Reminder provider result',sign_in:'Signed in',sign_out:'Signed out',upload_proof:'Uploaded proof',view_proof:'Viewed proof',ui_activity:'Portal activity',
  create_customer:'Created customer',update_customer:'Updated customer',delete_customers:'Processed customer deletion',
  assign_customer:'Changed collection-agent assignment',create_loan:'Created loan',update_loan:'Updated loan',
  foreclose_loan:'Foreclosed loan by override',reopen_loan:'Reopened foreclosed loan',
  create_collection:'Recorded collection',update_collection:'Updated collection',create_agent:'Created collection agent',
  update_agent:'Updated collection agent',delete_agent:'Archived collection agent',
  update_admin_profile:'Updated administrator profile',update_branding:'Updated application branding',
};
const entityType=(action:AuditAction)=>action.includes('customer')?'customer':action.includes('loan')?'loan':action.includes('collection')?'collection':action.includes('agent')?'agent':action==='update_branding'?'settings':'administrator';
const entityId=(action:AuditAction,body:Record<string,unknown>)=>{
  if(action==='delete_customers')return (Array.isArray(body.ids)?body.ids.map(String):[]).join(', ')||null;
  if(action==='assign_customer')return String(body.customer_id||'')||null;
  return String(body._entity_id||body.id||'')||null;
};
function metadata(action:AuditAction,body:Record<string,unknown>){
  if(action.startsWith('reminder_'))return {loan_id:body.loan_id,channel:body.channel,kind:body.kind,source:body.source,status:body.status,provider_sid:body.provider_sid,customer_id:body.customer_id,sms:body.sms,whatsapp:body.whatsapp,reason:body.reason,automatic:body.automatic,offsets:body.offsets};
  if(action==='sign_in'||action==='sign_out')return {};
  if(action==='upload_proof'||action==='view_proof')return {file_key:body.id};
  if(action==='ui_activity')return {activity:body.activity,source:'Browser-reported interaction'};
  if(action==='create_customer'||action==='update_customer')return {name:body.name,phone:body.phone,email:body.email||null};
  if(action==='delete_customers')return {requested_ids:Array.isArray(body.ids)?body.ids.map(String):[],deleted_ids:body.deleted_ids||[],blocked_ids:body.blocked_ids||[]};
  if(action==='assign_customer')return {agent_id:body.agent_id||null};
  if(action==='create_loan')return {customer_id:body.customer_id,principal:Number(body.principal),interest_type:body.interest_type,interest_rate:Number(body.interest_rate),repayment_frequency:body.repayment_frequency};
  if(action==='update_loan')return {interest_rate:Number(body.interest_rate),next_due_date:body.next_due_date,remarks:body.remarks||null};
  if(action==='foreclose_loan')return {settlement_amount:Number(body.amount),waived_amount:body.waived_amount,original_balance:body.original_balance,remarks:body.remarks,proof_file_key:body.proof_file_key||null};
  if(action==='reopen_loan')return {restored_balance:Number(body.restored_balance),reason:body.reason,previous_foreclosure:body.previous_foreclosure};
  if(action==='create_collection'||action==='update_collection')return {loan_id:body.loan_id||null,amount:Number(body.amount),method:body.method,remarks:body.remarks||null,proof_attached:Boolean(body.proof_file_key)};
  if(action==='create_agent'||action==='update_agent')return {name:body.name,phone:body.phone,username:body.username,password_changed:Boolean(body.password)};
  if(action==='delete_agent')return {agent_id:body.id};
  if(action==='update_admin_profile')return {name:body.name,username:body.username,password_changed:Boolean(body.password_changed)};
  return {logo_changed:Boolean(body.logo_changed),favicon_changed:Boolean(body.favicon_changed)};
}
export function createAuditLog(session:AppSession,action:AuditAction,body:Record<string,unknown>,createdAt=Math.floor(Date.now()/1000)):StoredAuditLog{
  return {id:'LOG-'+crypto.randomUUID(),actor_id:session.id,actor_name:session.name,actor_role:session.role,action,entity_type:entityType(action),entity_id:entityId(action,body),summary:labels[action],metadata:metadata(action,body),created_at:createdAt};
}
const localRequest=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);
export async function appendAuditLog(request:Request,session:AppSession,action:AuditAction,body:Record<string,unknown>){
  if(session.role==='customer')return;
  const record=createAuditLog(session,action,body);
  if(!hasSupabaseConfig()&&(process.env.NODE_ENV!=='production'||localRequest(request))){await mutateLocalStore(data=>{data.audit_logs.unshift(record)});return}
  const result=await getSupabaseAdmin().from('audit_logs').insert(record);if(result.error)throw new Error(result.error.message);
}
