import {upfrontTerms} from './upfront-loan';
type Receipt={amount:number;collected_at:number};
export function loanLedger(receipts:Receipt[],frequency:string,start:string,_end?:string){
 let dates:string[];try{dates=upfrontTerms(start,frequency,_end).dates}catch{return []}
 const rows=dates.map((date,i)=>({label:`${frequency==='daily'?'Day':frequency==='weekly'?'Week':'Month'} ${i+1}`,date,amount:0,count:0}));
 for(const receipt of receipts){
  const stamp=new Date(Number(receipt.collected_at)*1000);if(!Number.isFinite(stamp.getTime()))continue;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp);
  // Receipt-date periods end at each scheduled due date. Keep early/late
  // receipts in the first/last period instead of extending the loan term.
  const found=dates.findIndex(d=>date<=d),index=found<0?dates.length-1:found;
  rows[index].amount+=Number(receipt.amount);rows[index].count++;
 }
 return rows;
}
