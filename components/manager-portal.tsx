'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Archive,CalendarDays,Download,FileText,HandCoins,Pencil,Plus,Search,ShieldCheck,Trash2,UserPlus,UsersRound,WalletCards,type LucideIcon} from 'lucide-react';
import {type Permission} from '@/lib/permissions';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './ui/dialog';
import {ReceiptCorrections} from './receipt-corrections';
import {CollectionLedger} from './collection-ledger';
import {categorizeCollections} from '@/lib/collection-frequency';

type PortalData={customers:any[];loans:any[];collections:any[];agents:any[]};
const money=(value:unknown)=>'₹'+Number(value||0).toLocaleString('en-IN');
const Card=({children,className=''}:{children:ReactNode;className?:string})=><div className={'rounded-2xl border border-[#dbe5e0] bg-white shadow-[0_10px_28px_rgba(17,47,36,.03)] '+className}>{children}</div>;
const PageHead=({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode})=><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-[#71857c]">{eyebrow}</p><h1 className="text-3xl font-bold tracking-[-.035em]">{title}</h1><p className="mt-1.5 text-sm text-[#6c8078]">{subtitle}</p></div>{action}</div>;
const Metric=({icon:Icon,label,value,note,warning}:{icon:LucideIcon;label:string;value:string;note:string;warning?:boolean})=><Card className="p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#71847c]">{label}</p><div className={'grid size-9 place-items-center rounded-xl '+(warning?'bg-[#fff0e9] text-[#c95741]':'bg-[#e7f5ed] text-[#237253]')}><Icon className="size-4"/></div></div><p className="mt-4 text-[26px] font-bold tracking-[-.035em]">{value}</p><p className={'mt-2 text-xs '+(warning?'text-[#ca6049]':'text-[#7d8e87]')}>{note}</p></Card>;
function ReportTable({title,headers,rows}:{title:string;headers:string[];rows:string[][]}){return <Card className="overflow-x-auto"><div className="border-b border-[#e4ebe7] px-5 py-4"><b>{title}</b></div><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="bg-[#f7faf8] text-[10px] uppercase tracking-wider text-[#7f9189]">{headers.map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-t border-[#edf1ef]">{row.map((value,j)=><td key={j} className={'px-4 py-3 '+(j===0?'font-semibold':'')}>{value}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-center text-sm text-[#73867d]">No records available.</p>}</Card>}

export function ManagerPortal({active,permissions,open}:{active:string;permissions:Permission[];open:(modal:'customer'|'loan'|'payment')=>void}){
 const [data,setData]=useState<PortalData|null>(null),[error,setError]=useState(''),[form,setForm]=useState<Record<string,any>|null>(null),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
 const load=async()=>{try{const r=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(15000)}),d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);setError('')}catch(e){setData(null);setError(e instanceof Error?e.message:'Loading failed')}};
 useEffect(()=>{void load();window.addEventListener('fundflow-data',load);window.addEventListener('focus',load);return()=>{window.removeEventListener('fundflow-data',load);window.removeEventListener('focus',load)}},[]);
 useEffect(()=>setQuery(''),[active]);
 const can=(p:Permission)=>permissions.includes(p);
 const submit=async()=>{if(busy||!form)return;setBusy(true);try{const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),d=await r.json();if(!r.ok)throw new Error(d.error);setForm(null);await load();window.dispatchEvent(new Event('fundflow-data'));if(d.blocked_ids?.length)setError('Some customers were retained because loans are open or unpaid.')}catch(e){setError(e instanceof Error?e.message:'Save failed')}finally{setBusy(false)}};
 const exportReport=()=>{if(!data)return;const records=[['Type','ID','Name','Amount / balance'],...data.customers.map(r=>['Customer',r.id,r.name,r.outstanding]),...data.loans.map(r=>['Loan',r.id,r.customer_name,r.balance]),...data.collections.map(r=>['Collection',r.id,r.customer_name,r.amount])],csv=records.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='RMV-Finance-Manager-Report.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const isCustomers=active==='Customers',isLoans=active==='Loans',isAgents=active==='Agents',isReports=active==='Reports';
 const page=isCustomers?['Borrower management','Customers','Create, update and assign permitted customer records.']:isLoans?['Portfolio','All loans','Review balances, schedules and permitted loan actions.']:isAgents?['Field operations','Collection agents','Monitor assignments and manage permitted agent accounts.']:isReports?['Portfolio intelligence','Reports','Live totals and exports from every record available to your role.']:['Payment operations','Collections','Review receipts, ledgers and permitted correction requests.'];
 const source=data?(isCustomers?data.customers:isLoans?data.loans:isAgents?data.agents:data.collections):[];
 const rows=useMemo(()=>{const q=query.trim().toLowerCase();return q?source.filter(row=>Object.values(row).join(' ').toLowerCase().includes(q)):source},[query,source]);
 const action=isCustomers&&can('create_customer')?<Button className="h-10 rounded-xl px-4" onClick={()=>open('customer')}><Plus/> Create customer</Button>:isLoans&&can('create_loan')?<Button className="h-10 rounded-xl px-4" onClick={()=>open('loan')}><Plus/> New loan</Button>:isAgents&&can('create_agent')?<Button className="h-10 rounded-xl px-4" onClick={()=>setForm({action:'create_agent',name:'',phone:'',username:'',password:''})}><UserPlus/> Create agent</Button>:active==='Collections'&&can('create_collection')?<Button className="h-10 rounded-xl px-4" onClick={()=>open('payment')}><Plus/> Record collection</Button>:isReports&&data?<Button className="h-10 rounded-xl px-4" variant="outline" onClick={exportReport}><Download/> Export report</Button>:undefined;
 if(error&&!data)return <><PageHead eyebrow={page[0]} title={page[1]} subtitle={page[2]}/><Card className="p-6"><b className="text-[#a24432]">Could not load the manager workspace</b><p className="mt-1 text-sm text-[#71847c]">{error}</p><Button className="mt-4" onClick={load}>Try again</Button></Card></>;
 if(!data)return <><PageHead eyebrow={page[0]} title={page[1]} subtitle={page[2]}/><Card className="p-10 text-center text-sm text-[#71847c]">Loading manager workspace…</Card></>;
 const tableHead=isCustomers?['Customer','Contact','Active loans','Outstanding','Assigned agent','Actions']:isLoans?['Loan / customer','Schedule','Principal','Balance','Status','Actions']:isAgents?['Agent','Contact','Assigned','Collected','Account','Actions']:['Receipt / customer','Loan','Amount','Method','Collected by','Date'];
 const cells=(row:any):ReactNode[]=>isCustomers?[
  <div><b>{row.name}</b><p className="mt-1 text-xs text-[#7c8e86]">{row.id}</p></div>,
  <div>{row.phone}<p className="mt-1 text-xs text-[#7c8e86]">{row.occupation||'Occupation not recorded'}</p></div>,row.active_loans,<b>{money(row.outstanding)}</b>,
  <span className={'status '+(row.agent_name?'status-green':'status-amber')}>{row.agent_name||'Unassigned'}</span>,
  <div className="flex justify-end gap-1">{can('assign_customer')&&<Button variant="outline" size="sm" onClick={()=>setForm({action:'assign_customer',customer_id:row.id,agent_id:row.assigned_agent_id||''})}><UserPlus/> Assign</Button>}{can('update_customer')&&<Button variant="ghost" size="icon-sm" aria-label={'Edit '+row.name} onClick={()=>setForm({action:'update_customer',id:row.id,name:row.name,phone:row.phone,email:row.email||'',occupation:row.occupation||''})}><Pencil/></Button>}{can('delete_customers')&&<Button variant="ghost" size="icon-sm" className="text-[#bd503c]" aria-label={'Delete '+row.name} onClick={()=>setForm({action:'delete_customers',ids:[row.id]})}><Trash2/></Button>}</div>
 ]:isLoans?[
  <div><b>{row.customer_name}</b><p className="mt-1 text-xs text-[#7c8e86]">{row.id}</p></div>,
  <div className="capitalize">{row.repayment_frequency}<p className="mt-1 flex items-center gap-1 text-xs text-[#7c8e86]"><CalendarDays className="size-3"/> Due {row.next_due_date||'not set'}</p></div>,money(row.principal),<b>{money(row.balance)}</b>,
  <span className={'status '+(['active','closed'].includes(row.status)?'status-green':'status-red')}>{row.status}</span>,
  <div className="text-right">{can('update_loan')?<Button variant="outline" size="sm" onClick={()=>setForm({action:'update_loan',id:row.id,interest_rate:row.interest_rate,next_due_date:row.next_due_date,end_date:row.end_date||'',repayment_frequency:row.repayment_frequency,remarks:row.remarks||''})}><Pencil/> Edit loan</Button>:<span className="text-xs text-[#809189]">View only</span>}</div>
 ]:isAgents?[
  <div><b>{row.name}</b><p className="mt-1 text-xs text-[#7c8e86]">{row.id}</p></div>,
  <div>{row.phone}<p className="mt-1 text-xs text-[#7c8e86]">{row.email||'No email recorded'}</p></div>,row.assigned,<b>{money(row.collected)}</b>,<span className="status status-green">Active</span>,
  <div className="flex justify-end gap-1">{can('update_agent')&&<Button variant="outline" size="sm" onClick={()=>setForm({action:'update_agent',id:row.id,name:row.name,phone:row.phone,username:row.username||'',password:''})}><Pencil/> Edit</Button>}{can('delete_agent')&&<Button variant="ghost" size="icon-sm" className="text-[#bd503c]" aria-label={'Archive '+row.name} onClick={()=>setForm({action:'delete_agent',id:row.id})}><Archive/></Button>}</div>
 ]:[
  <div><b>{row.customer_name}</b><p className="mt-1 text-xs font-semibold text-[#35604f]">{row.id}</p></div>,row.loan_id,<b>{money(row.amount)}</b>,row.method,row.agent_name,<span className="text-xs text-[#667b72]">{new Date(Number(row.collected_at)*1000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</span>
 ];
 return <div><PageHead eyebrow={page[0]} title={page[1]} subtitle={page[2]} action={action}/>{error&&<p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}{isReports?<>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Metric icon={UsersRound} label="Customers" value={String(data.customers.length)} note="Permitted borrower records"/>
   <Metric icon={WalletCards} label="Amount disbursed" value={money(data.loans.reduce((s,r)=>s+Number(r.principal||0),0))} note={data.loans.length+' loan records'}/>
   <Metric icon={HandCoins} label="Amount collected" value={money(data.collections.reduce((s,r)=>s+Number(r.amount||0),0))} note={data.collections.length+' posted receipts'}/>
   <Metric icon={FileText} label="Outstanding" value={money(data.loans.filter(r=>r.status!=='closed').reduce((s,r)=>s+Number(r.balance||0),0))} note="Current open-loan balance" warning/>
  </div>
  <Card className="mt-6 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><b>Download complete reports</b><p className="mt-1 text-xs text-[#7c8d86]">The export uses live records available to your manager account.</p></div><Button variant="outline" onClick={exportReport}><Download/> Download CSV</Button></div></Card>
  <div className="mt-6 grid gap-6 xl:grid-cols-2">
   <ReportTable title={'Customers · '+data.customers.length} headers={['Customer','Loans','Outstanding','Agent']} rows={data.customers.map(r=>[r.name,String(r.active_loans),money(r.outstanding),r.agent_name||'Unassigned'])}/>
   <ReportTable title={'Loans · '+data.loans.length} headers={['Loan / customer','Principal','Paid','Balance']} rows={data.loans.map(r=>[r.id+' · '+r.customer_name,money(r.principal),money(r.paid),money(r.balance)])}/>
   <ReportTable title={'Collections · '+data.collections.length} headers={['Receipt / customer','Amount','Method','Collector']} rows={data.collections.map(r=>[r.id+' · '+r.customer_name,money(r.amount),r.method,r.agent_name])}/>
   <ReportTable title={'Agents · '+data.agents.length} headers={['Agent','Assigned','Collected','Phone']} rows={data.agents.map(r=>[r.name,String(r.assigned),money(r.collected),r.phone])}/>
  </div>
 </>:<>
  <Card className="mb-5 flex flex-col gap-3 p-4 md:flex-row md:items-center"><div className="flex flex-1 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f5ed] text-[#237253]"><Search className="size-4"/></div><div><b className="text-sm">Find a record</b><p className="text-xs text-[#71847c]">Search names, IDs, phone numbers, assignments or status.</p></div></div><div className="relative w-full md:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#789087]"/><Input className="h-10 rounded-xl bg-[#f7faf8] pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder={'Search '+active.toLowerCase()+'…'}/></div><span className="whitespace-nowrap rounded-full bg-[#eef6f1] px-3 py-2 text-xs font-bold text-[#315d4c]">{rows.length} records</span></Card>
  <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead><tr className="bg-[#f7faf8] text-[10px] uppercase tracking-wider text-[#768a81]">{tableHead.map((head,i)=><th key={head} className={'px-4 py-3 '+(i===0?'pl-5 ':'')+(i===tableHead.length-1&&active!=='Collections'?'text-right':'')}>{head}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-[#e8eeeb] hover:bg-[#f8fbf9]">{cells(row).map((cell,i)=><td key={i} className={'px-4 py-4 '+(i===0?'pl-5 ':'')}>{cell}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={6} className="p-10 text-center text-[#71857c]">No {active.toLowerCase()} match your search.</td></tr>}</tbody></table></div></Card>
  {active==='Collections'&&can('request_correction')&&<ReceiptCorrections receipts={data.collections} role="manager"/>}
  {active==='Collections'&&['daily','weekly','monthly'].map(f=><CollectionLedger key={f} frequency={f} receipts={categorizeCollections(data.loans,data.collections as {loan_id:string;amount:number;collected_at:number}[],f).collections}/>)}
 </>}
 <Dialog open={Boolean(form)} onOpenChange={v=>!v&&!busy&&setForm(null)}>
  <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
   <DialogHeader><DialogTitle className="capitalize">{form?.action?.replaceAll('_',' ')}</DialogTitle><DialogDescription>Only granted actions are available. Every change is recorded in the audit log.</DialogDescription></DialogHeader>
   {form&&<form onSubmit={e=>{e.preventDefault();void submit()}} className="grid gap-4 py-2 sm:grid-cols-2">
    {Object.keys(form).filter(k=>!['action','id','ids','customer_id'].includes(k)).map(k=><label key={k} className="text-sm font-medium capitalize">{k.replaceAll('_',' ')}
     {k==='agent_id'?<select value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"><option value="">Unassigned</option>{data.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
      :k==='repayment_frequency'?<select value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm">{['daily','weekly','monthly','yearly'].map(f=><option key={f}>{f}</option>)}</select>
      :<Input className="mt-1.5 h-10" required={!['email','remarks','password'].includes(k)||(k==='password'&&form.action==='create_agent')} autoComplete={k==='password'?'new-password':'off'} type={k==='password'?'password':k.includes('date')?'date':k==='interest_rate'?'number':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>}
    </label>)}
    {(form.action.startsWith('delete')||form.action==='delete_agent')&&<div className="flex gap-2 rounded-xl bg-[#fff0ed] p-3 text-sm text-[#9a4635] sm:col-span-2"><ShieldCheck className="mt-0.5 size-4 shrink-0"/><p>{form.action==='delete_agent'?'This agent will be archived and customers will become unassigned.':'Customers with open or unpaid loans will be retained; financial history remains available.'}</p></div>}
    {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setForm(null)}>Cancel</Button><Button disabled={busy}>{busy?'Saving…':'Confirm'}</Button></DialogFooter>
   </form>}
  </DialogContent>
 </Dialog>
 </div>;
}
