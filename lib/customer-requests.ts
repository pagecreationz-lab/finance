import type {LocalFinanceData} from './local-data-store';
import type {AppSession} from './auth';
import {createAuditLog} from './audit-log';
export type CustomerRequest={id:string;agent_id:string;agent_name:string;name:string;phone:string;email:string|null;occupation:string;status:'pending'|'approved'|'rejected';created_at:number;customer_id:string|null;reviewed_by:string|null;reviewed_at:number|null;review_reason:string|null};
export function customerInput(body:Record<string,unknown>){
 const name=String(body.name||'').trim(),phone=String(body.phone||'').replace(/[\s()+-]/g,''),email=String(body.email||'').trim(),occupation=String(body.occupation||'').trim();
 if(!name||name.length>100||!/^\d{7,15}$/.test(phone)||!occupation||occupation.length>120||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Enter a name, valid phone number, occupation and valid optional email.');
 return {name,phone,email:email||null,occupation};
}
export function requestSummary(r:CustomerRequest){return {id:r.id,status:r.status,created_at:r.created_at,reviewed_at:r.reviewed_at};}
export function mutateCustomerRequest(data:LocalFinanceData,body:Record<string,unknown>,session:AppSession){
 const requests=data.customer_requests??=[];const now=Math.floor(Date.now()/1000);
 if(body.action==='submit'){
   if(session.role!=='agent')throw new Error('Only agents can submit customer requests');
   const input=customerInput(body),existing=requests.find(r=>r.id===body.id);
   if(existing){if(existing.agent_id!==session.id||Object.entries(input).some(([k,v])=>existing[k as keyof CustomerRequest]!==v))throw new Error('Request ID already used');return existing;}
   const row:CustomerRequest={...input,id:String(body.id),agent_id:session.id,agent_name:session.name,status:'pending',created_at:now,customer_id:null,reviewed_by:null,reviewed_at:null,review_reason:null};
   requests.unshift(row);data.audit_logs.unshift(createAuditLog(session,'customer_submitted',{id:row.id,agent_id:session.id},now));return row;
 }
 if(!['admin','manager'].includes(session.role))throw new Error('Admin Manager approval is required');
 const row=requests.find(r=>r.id===body.id);if(!row)throw new Error('Request not found');
 if(row.status!=='pending')throw new Error('Request has already been reviewed');
 const reason=String(body.reason||'').trim();if(reason.length>1000)throw new Error('Review reason must be at most 1,000 characters');
 if(body.action==='approve'){
   if(!data.users.some(u=>u.id===row.agent_id&&u.role==='agent'))throw new Error('Submitting agent is no longer active. Reject this request.');
   const id='customer-'+row.id;
   data.users.push({id,name:row.name,phone:row.phone,email:row.email,occupation:row.occupation,role:'customer',assigned_agent_id:row.agent_id,created_at:now});row.customer_id=id;
 }else if(body.action!=='reject')throw new Error('Invalid decision');
 row.status=body.action==='approve'?'approved':'rejected';row.reviewed_by=session.id;row.reviewed_at=now;row.review_reason=reason||null;
 data.audit_logs.unshift(createAuditLog(session,row.status==='approved'?'customer_approved':'customer_rejected',{id:row.id,customer_id:row.customer_id,agent_id:row.agent_id,reason},now));return row;
}
