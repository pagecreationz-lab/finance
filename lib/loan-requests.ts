import type {LocalFinanceData} from './local-data-store';
import type {AppSession} from './auth';
import {createAuditLog} from './audit-log';
import {validDate} from './collection-records';
import {flatInterest,installmentDates} from './loan-calculation';
import {upfrontInterest,upfrontTerms} from './upfront-loan';
import {customerInput} from './customer-requests';
import {loanNumber} from './loan-number';
export type LoanInput={loan_number?:string|null;new_customer?:ReturnType<typeof customerInput>|null;customer_id:string;principal:number;interest_type:string;interest_rate:number;repayment_frequency:string;given_date:string;next_due_date:string;end_date:string;security_type:string;remarks:string|null};
export type LoanRequest=LoanInput&{id:string;agent_id:string;agent_name:string;customer_name:string;status:'pending'|'approved'|'rejected';created_at:number;loan_id:string|null;reviewed_by:string|null;reviewed_at:number|null;review_reason:string|null};
export function loanInput(body:Record<string,unknown>):LoanInput{
 const customer_id=String(body.customer_id||''),principal=Number(body.principal),interest_rate=Number(body.interest_rate),interest_type=String(body.interest_type||'fixed'),repayment_frequency=String(body.repayment_frequency||''),security_type=String(body.security_type||'asset'),remarks=String(body.remarks||'').trim();
 const given_date=String(body.given_date||'');
 const terms=upfrontTerms(given_date,repayment_frequency),next_due_date=terms.first_due_date,end_date=terms.end_date;
 const new_customer=body.new_customer?customerInput(body.new_customer as Record<string,unknown>):null;
 if((!customer_id&&!new_customer)||(customer_id&&new_customer)||customer_id.length>100||!Number.isSafeInteger(principal)||principal<=0||body.interest_rate===undefined||body.interest_rate===null||body.interest_rate===''||!Number.isFinite(interest_rate)||interest_rate<0||!['fixed','floating'].includes(interest_type)||!['daily','weekly','monthly','yearly'].includes(repayment_frequency)||!['asset','surety'].includes(security_type)||remarks.length>2000)throw new Error('Enter a valid customer, whole-rupee loan amount, interest rate, return basis and security type.');
 if(!validDate(given_date)||!validDate(next_due_date)||!validDate(end_date)||given_date<'1900-01-01'||end_date<given_date||next_due_date<given_date||next_due_date>end_date)throw new Error('Valid start, due and end dates are required; due date must fall between start and end.');
 if(interest_type!=='fixed')throw new Error('New loans use flat interest on original principal for the entire term.');
 upfrontInterest(principal,interest_rate);
 return {customer_id,principal,interest_type,interest_rate,repayment_frequency:terms.repayment_frequency,given_date,next_due_date,end_date,security_type,remarks:remarks||null,...(body.loan_number?{loan_number:loanNumber(body.loan_number)}:{}),...(new_customer?{new_customer}:{})};
}
export function loanRequestSummary(r:LoanRequest){return {id:r.id,status:r.status,created_at:r.created_at,reviewed_at:r.reviewed_at};}
export function mutateLoanRequest(data:LocalFinanceData,body:Record<string,unknown>,session:AppSession){
 const requests=data.loan_requests??=[];const now=Math.floor(Date.now()/1000);
 if(body.action==='submit'){
   if(session.role!=='agent')throw new Error('Only agents can submit loan requests');
   const input=loanInput(body),existing=requests.find(r=>r.id===body.id);
   if(existing){if(existing.agent_id!==session.id||Object.entries(input).some(([k,v])=>JSON.stringify(existing[k as keyof LoanRequest])!==JSON.stringify(v)))throw new Error('Request ID already used');return existing;}
   if(input.loan_number&&(data.loans.some(l=>(l.id.toUpperCase()===input.loan_number||(l.loan_number||l.id).toUpperCase()===input.loan_number))||requests.some(r=>r.status==='pending'&&r.loan_number===input.loan_number)))throw new Error('Loan number is already in use or awaiting approval.');
   const customer=data.users.find(u=>u.id===input.customer_id&&u.role==='customer'&&u.assigned_agent_id===session.id);
   if(!customer&&!input.new_customer)throw new Error('Choose an approved customer currently assigned to you.');
   const row:LoanRequest={...input,id:String(body.id),agent_id:session.id,agent_name:session.name,customer_name:input.new_customer?.name||customer!.name,status:'pending',created_at:now,loan_id:null,reviewed_by:null,reviewed_at:null,review_reason:null};
   requests.unshift(row);data.audit_logs.unshift(createAuditLog(session,'loan_submitted',{id:row.id,agent_id:session.id,customer_id:row.customer_id},now));return row;
 }
 if(!['admin','manager'].includes(session.role))throw new Error('Admin Manager approval is required');
 const row=requests.find(r=>r.id===body.id);if(!row)throw new Error('Request not found');
 if(row.status!=='pending')throw new Error('Request has already been reviewed');
 const reason=String(body.reason||'').trim();if(reason.length>1000)throw new Error('Review reason must be at most 1,000 characters');
 if(body.action==='approve'){
   if(!data.users.some(u=>u.id===row.agent_id&&u.role==='agent'))throw new Error('Submitting agent is no longer active. Reject this request.');
   if(!row.new_customer&&!data.users.some(u=>u.id===row.customer_id&&u.role==='customer'&&u.assigned_agent_id===row.agent_id))throw new Error('Customer is no longer active or assigned to the submitting agent. Reject and resubmit.');
   const input=loanInput({...row,customer_id:row.new_customer?'':row.customer_id}),id=row.loan_number||'LN-'+row.id;
   if(data.loans.some(l=>(l.id.toUpperCase()===id.toUpperCase()||(l.loan_number||l.id).toUpperCase()===id.toUpperCase())))throw new Error('Loan number is already in use.');
   if(row.new_customer){const customer_id='customer-loan-'+row.id;data.users.push({...customerInput(row.new_customer),id:customer_id,role:'customer',assigned_agent_id:row.agent_id,created_at:now});input.customer_id=customer_id;row.customer_id=customer_id;}
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const {new_customer:_,loan_number:__,...terms}=input;void _;void __;
   data.loans.push({...terms,id,balance:input.principal,security_file_key:null,status:input.next_due_date<today?'overdue':'active'});row.loan_id=id;
 }else if(body.action!=='reject')throw new Error('Invalid decision');
 row.status=body.action==='approve'?'approved':'rejected';row.reviewed_by=session.id;row.reviewed_at=now;row.review_reason=reason||null;
 data.audit_logs.unshift(createAuditLog(session,row.status==='approved'?'loan_approved':'loan_rejected',{id:row.id,loan_id:row.loan_id,customer_id:row.customer_id,agent_id:row.agent_id,principal:row.principal,reason},now));return row;
}
