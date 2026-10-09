import {validDate} from './collection-records';
export function collectionDueDate(loan:{next_due_date?:string;next_payment_date?:string|null}){
 const date=loan.next_payment_date!==undefined?loan.next_payment_date:loan.next_due_date;
 return validDate(date)?date:null;
}
export function agentLoanStatus(loan:{status:string;balance:number;next_due_date?:string;next_payment_date?:string|null},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 if(loan.status==='foreclosed')return {label:'Foreclosed',className:'bg-slate-100 text-slate-600',collectable:false};
 if(Number(loan.balance)===0||loan.status==='closed')return {label:'Paid',className:'status-green',collectable:false};
 const due=collectionDueDate(loan);
 if(!due)return {label:'Schedule unavailable',className:'bg-slate-100 text-slate-600',collectable:false};
 const display=new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(due+'T00:00:00Z'));
 return {label:`${due<today?'Overdue since':due===today?'Due today':'Upcoming'} · ${display}`,className:due<today?'status-red':'bg-orange-100 text-orange-700',collectable:true};
}
