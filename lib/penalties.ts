import type {LocalFinanceData, StoredLoan, StoredAuditLog} from './local-data-store';
import type {AppSession} from './auth';
import {upfrontCalculation, UPFRONT_MODEL} from './upfront-loan';
import {validDate} from './collection-records';

export type PenaltyRequest={id:string;loan_id:string;amount:number;missed_dates:string[];reason:string;requested_by:string;requested_name:string;created_at:number;status:'pending'|'approved'|'rejected'|'collected';reviewed_by?:string|null;reviewed_name?:string|null;reviewed_at?:number|null;receipt_id?:string|null};
export const indiaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function penaltyInput(body:Record<string,unknown>){
 const amount=Number(body.amount),dates=body.missed_dates;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000)throw new Error('Enter a positive whole-rupee penalty total (maximum ₹10 crore).');
 if(!Array.isArray(dates)||!dates.length||dates.length>100||dates.some(d=>typeof d!=='string'||!validDate(d))||new Set(dates).size!==dates.length)throw new Error('Select the missed installment dates.');
 const reason=String(body.reason||'').trim();if(reason.length>1000)throw new Error('Reason must be at most 1,000 characters.');
 return {amount,missed_dates:[...dates].sort() as string[],reason};
}
export function missedInstallments(loan:StoredLoan,today=indiaToday()){
 if(loan.interest_model!==UPFRONT_MODEL||loan.repayment_frequency!=='daily'||!['active','overdue'].includes(loan.status)||loan.balance<=0)return [];
 return upfrontCalculation(loan,today).schedule.filter(r=>r.date<today&&r.due>0).map(r=>r.date);
}
export function approvedPenalty(requests:PenaltyRequest[]=[],loanId:string){return requests.filter(r=>r.loan_id===loanId&&r.status==='approved').reduce((s,r)=>s+Number(r.amount),0)}
function audit(data:LocalFinanceData,session:AppSession,p:PenaltyRequest,action:string){
 const log:StoredAuditLog={id:'LOG-'+crypto.randomUUID(),actor_id:session.id,actor_name:session.name,actor_role:session.role,action,entity_type:'penalty',entity_id:p.id,summary:action.replaceAll('_',' '),metadata:{...p},created_at:Math.floor(Date.now()/1000)};data.audit_logs.unshift(log);
}
export function requestPenalty(data:LocalFinanceData,body:Record<string,unknown>,session:AppSession){
 const requests=data.penalty_requests??=[],action=String(body.action),now=Math.floor(Date.now()/1000);
 if(action==='request'){
  if(session.role!=='agent')throw new Error('Only collection agents can enter penalty charges.');
  const input=penaltyInput(body),loan=data.loans.find(l=>l.id===body.loan_id);
  if(!loan||!data.users.some(u=>u.id===loan.customer_id&&u.role==='customer'&&u.assigned_agent_id===session.id))throw new Error('Loan is not assigned to you.');
  const eligible=missedInstallments(loan);
  if(input.missed_dates.some(d=>!eligible.includes(d)))throw new Error('Choose overdue unpaid dates on an open 100-day daily loan.');
  if(requests.some(r=>r.id===body.id))throw new Error('Request already submitted. Refresh the list.');
  if(requests.some(r=>r.loan_id===loan.id&&r.status!=='rejected'&&r.missed_dates.some(d=>input.missed_dates.includes(d))))throw new Error('A penalty already exists for one of these dates.');
  const p:PenaltyRequest={id:String(body.id),loan_id:loan.id,...input,requested_by:session.id,requested_name:session.name,created_at:now,status:'pending'};
  requests.unshift(p);audit(data,session,p,'penalty_requested');return p;
 }
 if(!['admin','manager'].includes(session.role))throw new Error('Admin Manager or Super Admin approval is required.');
 const p=requests.find(r=>r.id===body.id);if(!p||p.status!=='pending')throw new Error('Pending penalty request not found.');
 if(p.requested_by===session.id)throw new Error('You cannot approve your own request.');
 if(action==='approve'){
  const loan=data.loans.find(l=>l.id===p.loan_id);
  if(!loan||!missedInstallments(loan).length||!data.users.some(u=>u.id===loan.customer_id&&u.assigned_agent_id===p.requested_by)||!data.users.some(u=>u.id===p.requested_by&&u.role==='agent'))throw new Error('Loan or assignment changed. Reject this request.');
  if(p.missed_dates.some(d=>!missedInstallments(loan).includes(d)))throw new Error('These installments have been paid. Reject this request.');
 }
 Object.assign(p,{status:action==='approve'?'approved':'rejected',reviewed_by:session.id,reviewed_name:session.name,reviewed_at:now});audit(data,session,p,'penalty_'+p.status);return p;
}
