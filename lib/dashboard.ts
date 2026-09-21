export type DashboardLoan = {id:string; customer_name:string; principal:number; balance:number; status:string; given_date:string; next_due_date:string};
export type DashboardReceipt = {id:string; amount:number; collected_at:number};
export function indiaDate(date:Date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function dashboardTotals(loans:DashboardLoan[],receipts:DashboardReceipt[],period:string,now=new Date()) {
  const today=indiaDate(now), startDate=new Date(today+'T00:00:00Z');
  if(period==='Week')startDate.setUTCDate(startDate.getUTCDate()-6);
  if(period==='Month')startDate.setUTCDate(1);
  const start=startDate.toISOString().slice(0,10), within=(date:string)=>date>=start&&date<=today;
  const open=loans.filter(l=>!['closed','foreclosed'].includes(l.status)&&Number(l.balance)>0);
  const issued=loans.filter(l=>within(l.given_date)).sort((a,b)=>b.given_date.localeCompare(a.given_date));
  const paid=receipts.filter(r=>Number(r.collected_at)*1000<=now.getTime()&&within(indiaDate(new Date(Number(r.collected_at)*1000))));
  const overdue=open.filter(l=>l.next_due_date&&l.next_due_date<today);
  const due=open.filter(l=>within(l.next_due_date));
  return {today,start,open,issued,paid,overdue,due,portfolio:open.reduce((s,l)=>s+Number(l.balance),0),collected:paid.reduce((s,r)=>s+Number(r.amount),0),disbursed:issued.reduce((s,l)=>s+Number(l.principal),0),overdueBalance:overdue.reduce((s,l)=>s+Number(l.balance),0)};
}
