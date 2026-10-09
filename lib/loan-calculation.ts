import {validDate} from './collection-records';
import {UPFRONT_MODEL,upfrontCalculation,refreshUpfrontLoan} from './upfront-loan';
export type CalculatedLoan={principal:number;balance:number;interest_rate:number;interest_type:string;repayment_frequency:string;given_date:string;end_date?:string|null;next_due_date:string;status:string;interest_model?:string|null;interest_amount?:number|null;first_due_date?:string|null};
export const FLAT_MODEL='flat_term_v1';
export function flatInterest(principal:number,rate:number){
 if(!Number.isSafeInteger(principal)||principal<=0||!Number.isFinite(rate)||rate<0||rate>10000||Math.abs(rate*10000-Math.round(rate*10000))>0.000001)throw new Error('Use a positive whole-rupee principal and a term interest rate from 0 to 10,000 with at most four decimal places.');
 const amount=Number((BigInt(principal)*BigInt(Math.round(rate*10000))+BigInt(500000))/BigInt(1000000));
 if(!Number.isSafeInteger(principal+amount))throw new Error('Total repayable exceeds the supported amount.');
 return amount;
}
export function installmentDates(first:string,end:string,frequency:string){
 if(!validDate(first)||!validDate(end)||first>end||!['daily','weekly','monthly','yearly'].includes(frequency))throw new Error('Valid first due date, end date and return basis are required.');
 const result:string[]=[];const anchor=new Date(first+'T00:00:00Z');
 for(let i=0;i<10000;i++){
   let d:Date;
   if(frequency==='daily'||frequency==='weekly'){d=new Date(anchor);d.setUTCDate(d.getUTCDate()+i*(frequency==='weekly'?7:1));}
   else{const month=anchor.getUTCMonth()+i*(frequency==='yearly'?12:1);d=new Date(Date.UTC(anchor.getUTCFullYear(),month,1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchor.getUTCDate(),last));}
   const date=d.toISOString().slice(0,10);if(date>=end){result.push(end);return result;}result.push(date);
 }
 throw new Error('Loan term cannot exceed 10,000 installments.');
}
export function defaultFirstDue(start:string,end:string,frequency:string){
 if(!validDate(start)||!validDate(end)||end<start)throw new Error('Valid start and end dates are required.');
 const d=new Date(start+'T00:00:00Z');
 if(frequency==='daily'||frequency==='weekly')d.setUTCDate(d.getUTCDate()+(frequency==='weekly'?7:1));
 else{const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+(frequency==='yearly'?12:1));d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));}
 return d.toISOString().slice(0,10)>end?end:d.toISOString().slice(0,10);
}
export function loanCalculation(loan:CalculatedLoan,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 if(loan.interest_model===UPFRONT_MODEL)return upfrontCalculation(loan,today);
 const interest=flatInterest(Number(loan.principal),Number(loan.interest_rate)),total=Number(loan.principal)+interest;
 const first=loan.first_due_date||loan.next_due_date||defaultFirstDue(loan.given_date,String(loan.end_date),loan.repayment_frequency);
 if(!validDate(loan.given_date)||first<loan.given_date)throw new Error('First due date must be on or after the start date.');
 const dates=installmentDates(first,String(loan.end_date),loan.repayment_frequency),count=dates.length,base=Math.floor(total/count),extra=total%count;
 const paid=Math.max(0,total-Number(loan.balance));let cumulative=0;
 const schedule=dates.map((date,i)=>{const amount=base+(i<extra?1:0),applied=Math.min(amount,Math.max(0,paid-cumulative));cumulative+=amount;return {date,amount,paid:applied,due:amount-applied};});
 const next=schedule.find(r=>r.due>0),settled=['closed','foreclosed'].includes(loan.status)||loan.balance===0;
 return {interest_amount:interest,total_repayable:total,credited_amount:paid,installment_count:count,installment_min:base,installment_max:base+(extra?1:0),next_payment_date:settled?null:next?.date||null,next_installment_due:settled?0:next?.due||0,overdue_amount:settled?0:schedule.filter(r=>r.date<today).reduce((s,r)=>s+r.due,0),schedule};
}
// Adds interest once to an existing principal-only balance; never rewrites receipts.
export function initializeFlatLoan<T extends CalculatedLoan>(loan:T):T{
 if(loan.interest_model===FLAT_MODEL)return loan;
 if(loan.interest_model==='legacy'||loan.interest_type!=='fixed'||['closed','foreclosed'].includes(loan.status)||!validDate(loan.end_date)||!validDate(loan.given_date)||loan.balance>loan.principal||loan.balance<0){loan.interest_model='legacy';return loan;}
 const interest=flatInterest(loan.principal,loan.interest_rate);
 const first=loan.first_due_date||loan.next_due_date||defaultFirstDue(loan.given_date,loan.end_date,loan.repayment_frequency);
 loanCalculation({...loan,first_due_date:first,balance:loan.balance+interest});
 loan.first_due_date=first;loan.interest_amount=interest;loan.interest_model=FLAT_MODEL;loan.balance+=interest;
 refreshFlatLoan(loan);return loan;
}
export function refreshFlatLoan(loan:CalculatedLoan,previous?:CalculatedLoan){
 if(loan.interest_model===UPFRONT_MODEL)return refreshUpfrontLoan(loan,previous);
 if(loan.interest_model!==FLAT_MODEL)return;
 if(previous&&(loan.interest_type!==previous.interest_type||loan.interest_model!==previous.interest_model))throw new Error('Loan interest model cannot be changed.');
 if(previous&&(loan.principal!==previous.principal||loan.interest_rate!==previous.interest_rate||loan.end_date!==previous.end_date||loan.repayment_frequency!==previous.repayment_frequency||loan.next_due_date!==previous.next_due_date)&&['closed','foreclosed'].includes(previous.status))throw new Error('Closed or foreclosed loan terms cannot be changed.');
 if(previous&&loan.next_due_date!==previous.next_due_date)loan.first_due_date=loan.next_due_date;
 const interest=flatInterest(loan.principal,loan.interest_rate);
 if(previous&&previous.interest_model===FLAT_MODEL)loan.balance+=interest-Number(previous.interest_amount||0)+(loan.principal-previous.principal);
 loan.interest_amount=interest;
 if(loan.balance<0)throw new Error('Revised total repayable is below the credited payments.');
 if(loan.balance>loan.principal+interest)throw new Error('Balance cannot exceed total repayable.');
 if(loan.status==='foreclosed')return;
 const calc=loanCalculation({...loan,status:loan.balance===0?'closed':'active'});
 loan.next_due_date=calc.next_payment_date||String(loan.end_date);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 loan.status=loan.balance===0?'closed':loan.next_due_date<today?'overdue':'active';
}
export function loanSummary(loan:CalculatedLoan){
 if(loan.interest_model!==FLAT_MODEL&&loan.interest_model!==UPFRONT_MODEL)return {};
 const {schedule,...summary}=loanCalculation(loan);void schedule;return summary;
}
export function exactCollectionAmount(loan:CalculatedLoan):number {
 if(loan.interest_model!==FLAT_MODEL&&loan.interest_model!==UPFRONT_MODEL)throw new Error('Loan schedule requires admin review before collection.');
 const amount=loanCalculation(loan).next_installment_due;
 if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('No outstanding installment to collect.');
 return amount;
}
