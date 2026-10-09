import {validDate} from './collection-records';
type Receipt={amount:number;collected_at:number};
export function loanLedger(receipts:Receipt[],frequency:string,start:string,end:string){
 if(!validDate(start)||!validDate(end)||end<start)return [];
 const anchor=new Date(start+'T00:00:00Z');
 const boundary=(i:number)=>{const d=new Date(anchor);if(frequency==='daily'||frequency==='weekly')d.setUTCDate(d.getUTCDate()+i*(frequency==='weekly'?7:1));else{d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);d.setUTCDate(Math.min(anchor.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()))}return d.toISOString().slice(0,10)};
 const dated=receipts.map(r=>({...r,date:Number.isFinite(r.collected_at)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.collected_at*1000)):''}));
 const until=dated.reduce((last,r)=>r.date>last?r.date:last,end);
 const rows=[];
 for(let i=0;i<10000;i++){
  const from=boundary(i);if(from>until)break;
  const next=boundary(i+1),last=frequency!=='daily'&&next>=until;
  const to=last?until:new Date(new Date(next+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
  const matches=dated.filter(r=>r.date>=from&&r.date<=to);
  rows.push({label:frequency==='daily'?from:`${frequency==='weekly'?'Week':'Month'} ${i+1} · ${from} – ${to}`,amount:matches.reduce((n,r)=>n+Number(r.amount),0),count:matches.length});
  if(last)break;
 }
 return rows;
}
