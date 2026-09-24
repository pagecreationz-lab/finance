import type {StoredCollection,LocalFinanceData} from './local-data-store';
import type {AppSession} from './auth';
import {createAuditLog} from './audit-log';
export type ReceiptCorrection={id:string;receipt_id:string;loan_id:string;before_amount:number;after_amount:number;base_revision:string|null;reason:string;requested_by:string;requested_name:string;created_at:number;status:'pending'|'approved'|'rejected';reviewed_by?:string|null;reviewed_name?:string|null;review_reason?:string|null;reviewed_at?:number|null;applied_sequence?:number|null};
export function effectiveCollections(collections:StoredCollection[],corrections:ReceiptCorrection[]=[]){
 const latest=new Map<string,ReceiptCorrection>();
 for(const c of corrections)if(c.status==='approved'&&(c.applied_sequence||0)>(latest.get(c.receipt_id)?.applied_sequence||0))latest.set(c.receipt_id,c);
 return collections.map(r=>{const c=latest.get(r.id);return {...r,original_amount:r.amount,amount:c?c.after_amount:r.amount,correction_id:c?.id||null,correction_reason:c?.reason||null,correction_approved_by:c?.reviewed_name||null}});
}
export function correctionReason(value:unknown){const reason=typeof value==='string'?value.trim():'';if(reason.length<10||reason.length>1000)throw new Error('Provide a reason between 10 and 1,000 characters.');return reason}
export function correctLocal(data:LocalFinanceData,body:Record<string,unknown>,session:AppSession){
 const corrections=data.receipt_corrections??=[];const now=Math.floor(Date.now()/1000);
 let c:ReceiptCorrection;
 if(body.action==='request'){
   const existing=corrections.find(r=>r.id===body.id);
   if(existing){if(existing.requested_by!==session.id||existing.receipt_id!==body.receipt_id||existing.after_amount!==body.amount||existing.reason!==body.reason)throw new Error('Correction request ID already used');return existing}
   const current=effectiveCollections(data.collections,corrections).find(r=>r.id===body.receipt_id);
   if(!current)throw new Error('Receipt not found');
   if((body.base_revision||null)!==current.correction_id||Number(body.before_amount)!==current.amount)throw new Error('Receipt changed. Refresh and submit a new correction.');
   const amount=Number(body.amount);if(!Number.isSafeInteger(amount)||amount<0||amount===current.amount)throw new Error('Enter a different non-negative whole-rupee amount.');
   c={id:String(body.id),receipt_id:current.id,loan_id:current.loan_id,before_amount:current.amount,after_amount:amount,base_revision:current.correction_id,reason:correctionReason(body.reason),requested_by:session.id,requested_name:session.name,created_at:now,status:'pending'};
   const loan=data.loans.find(l=>l.id===c.loan_id);if(!loan||loan.status==='foreclosed')throw new Error('Reopen the foreclosed loan before correcting a receipt.');
   corrections.unshift(c);data.audit_logs.unshift(createAuditLog(session,'receipt_correction_requested',c as unknown as Record<string,unknown>,now));
   if(session.role!=='admin')return c;
 }else{
   if(session.role!=='admin')throw new Error('Only the super admin can decide corrections.');
   const found=corrections.find(r=>r.id===body.id);if(!found)throw new Error('Correction request not found');c=found;
   if(c.status!=='pending')throw new Error('This request has already been decided.');
 }
 const reason=correctionReason(body.action==='request'?c.reason:body.reason);
 if(body.action==='reject'){
   Object.assign(c,{status:'rejected',reviewed_by:session.id,reviewed_name:session.name,review_reason:reason,reviewed_at:now});
   data.audit_logs.unshift(createAuditLog(session,'receipt_correction_rejected',c as unknown as Record<string,unknown>,now));return c;
 }
 const current=effectiveCollections(data.collections,corrections).find(r=>r.id===c.receipt_id);
 const loan=data.loans.find(l=>l.id===c.loan_id);
 if(!current||!loan||loan.status==='foreclosed')throw new Error('Receipt unavailable or loan foreclosed. Reopen the loan first.');
 if(current.correction_id!==c.base_revision||current.amount!==c.before_amount)throw new Error('Stale request: receipt changed. Reject it and request a new correction.');
 const balance=Number(loan.balance)+c.before_amount-c.after_amount;
 if(!Number.isSafeInteger(balance)||balance<0)throw new Error('Correction exceeds the loan outstanding balance.');
 loan.balance=balance;loan.status=balance===0?'closed':loan.next_due_date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())?'overdue':'active';
 const customer=data.users.find(u=>u.id===loan.customer_id);if(balance>0&&customer?.role==='archived_customer')customer.role='customer';
 Object.assign(c,{status:'approved',reviewed_by:session.id,reviewed_name:session.name,review_reason:reason,reviewed_at:now,applied_sequence:Math.max(0,...corrections.map(r=>r.applied_sequence||0))+1});
 data.audit_logs.unshift(createAuditLog(session,'receipt_correction_approved',{...c,balance_after:balance} as unknown as Record<string,unknown>,now));return c;
}
