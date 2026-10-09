import {validDate} from './collection-records';
import type {CalculatedLoan} from './loan-calculation';
export const UPFRONT_MODEL='upfront_net_v1';
export function upfrontInterest(principal:number,rate:number){
 if(!Number.isSafeInteger(principal)||principal<=0||!Number.isFinite(rate)||rate<0||rate>=100||Math.abs(rate*10000-Math.round(rate*10000))>0.000001)throw new Error('Enter a whole-rupee lending amount and interest from 0 to below 100%, with at most four decimal places.');
 const interest=Number((BigInt(principal)*BigInt(Math.round(rate*10000))+BigInt(500000))/BigInt(1000000));
 if(interest>=principal)throw new Error('Amount remaining after interest must be positive.');
 return interest;
}
export function upfrontTerms(start:string,frequency:string){
 if(!validDate(start)||start<'1900-01-01'||!['daily','weekly','monthly','yearly'].includes(frequency))throw new Error('Enter a valid start date and Daily, Weekly or Yearly loan type.');
 const basis=frequency==='monthly'?'yearly':frequency,count=basis==='daily'?100:basis==='weekly'?10:12,anchor=new Date(start+'T00:00:00Z');
 const dates=Array.from({length:count},(_,i)=>{
  const d=new Date(anchor),step=basis==='daily'?i:i+1;
  if(basis==='daily'||basis==='weekly')d.setUTCDate(d.getUTCDate()+step*(basis==='weekly'?7:1));
  else{d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step);d.setUTCDate(Math.min(anchor.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));}
  const date=d.toISOString().slice(0,10);if(!validDate(date))throw new Error('Loan end date is outside the supported range.');return date;
 });
 return {repayment_frequency:basis,first_due_date:dates[0],end_date:dates[dates.length-1],dates};
}
export function upfrontCalculation(loan:CalculatedLoan,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 const interest=upfrontInterest(Number(loan.principal),Number(loan.interest_rate)),total=Number(loan.principal)-interest;
 const terms=upfrontTerms(loan.given_date,loan.repayment_frequency),count=terms.dates.length,base=Math.floor(total/count),extra=total%count;
 const paid=Math.max(0,total-Number(loan.balance));let cumulative=0;
 const schedule=terms.dates.map((date,i)=>{const amount=base+(i<extra?1:0),applied=Math.min(amount,Math.max(0,paid-cumulative));cumulative+=amount;return {date,amount,paid:applied,due:amount-applied}});
 const settled=loan.balance===0||['closed','foreclosed'].includes(loan.status),next=schedule.find(r=>r.due>0);
 return {interest_amount:interest,total_repayable:total,credited_amount:paid,installment_count:count,installment_min:base,installment_max:base+(extra?1:0),next_payment_date:settled?null:next?.date||null,next_installment_due:settled?0:next?.due||0,overdue_amount:settled?0:schedule.filter(r=>r.date<today).reduce((n,r)=>n+r.due,0),schedule};
}
export function refreshUpfrontLoan(loan:CalculatedLoan,previous?:CalculatedLoan){
 if(previous&&['closed','foreclosed'].includes(previous.status)&&(loan.principal!==previous.principal||loan.interest_rate!==previous.interest_rate||loan.given_date!==previous.given_date||loan.repayment_frequency!==previous.repayment_frequency))throw new Error('Settled loan terms cannot be changed.');
 if(loan.interest_type!=='fixed')throw new Error('Upfront interest loans require a fixed deduction rate.');
 const interest=upfrontInterest(loan.principal,loan.interest_rate),terms=upfrontTerms(loan.given_date,loan.repayment_frequency);
 if(previous?.interest_model===UPFRONT_MODEL)loan.balance+=(loan.principal-interest)-(previous.principal-Number(previous.interest_amount||0));
 if(loan.balance<0||loan.balance>loan.principal-interest)throw new Error('Revised repayable amount cannot be below existing credits or below the balance.');
 Object.assign(loan,{interest_amount:interest,repayment_frequency:terms.repayment_frequency,first_due_date:terms.first_due_date,end_date:terms.end_date});
 if(loan.status==='foreclosed')return;
 const calc=upfrontCalculation({...loan,status:'active'});
 loan.next_due_date=calc.next_payment_date||terms.end_date;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 loan.status=loan.balance===0?'closed':loan.next_due_date<today?'overdue':'active';
}
export function initializeUpfrontLoan<T extends CalculatedLoan>(loan:T):T{
 const interest=upfrontInterest(loan.principal,loan.interest_rate);
 if(loan.balance!==loan.principal)throw new Error('New loans must start with an untouched lending amount.');
 loan.interest_model=UPFRONT_MODEL;loan.balance=loan.principal-interest;refreshUpfrontLoan(loan);return loan;
}
export function migrateUpfrontLoan(loan:CalculatedLoan){
 if(loan.interest_model===UPFRONT_MODEL||!['active','overdue'].includes(loan.status)||loan.interest_type!=='fixed')return false;
 try{
  const interest=upfrontInterest(loan.principal,loan.interest_rate);
  const oldTotal=loan.principal+(loan.interest_model==='flat_term_v1'?Number(loan.interest_amount||0):0),credits=oldTotal-loan.balance;
  if(credits<0||credits>loan.principal-interest)return false;
  const copy={...loan,interest_model:UPFRONT_MODEL,balance:loan.principal-interest-credits};refreshUpfrontLoan(copy);Object.assign(loan,copy);return true;
 }catch{return false}
}
