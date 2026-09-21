'use client';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
type Notice = { id:string; title:string; detail:string; target:string };
type Loan = {id:string;status:string;balance:number;next_due_date:string;customer_name:string};
type Receipt = {id:string;collected_at:number;amount:number;customer_name:string};
export function Notifications({userId,role,navigate}:{userId:string;role:string;navigate:(target:string)=>void}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState<Notice[]>([]),[read,setRead]=useState<string[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const key='rmv-notifications-read:'+userId;
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'[]');setRead(Array.isArray(saved)?saved.filter(id=>typeof id==='string'):[])}catch{setRead([])}},[key]);
  useEffect(()=>{
    let active=true,version=0;
    const load=async()=>{
      const current=++version;
      try{
        const response=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('Unable to load notifications. Please retry.');
        const data=await response.json();
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const money=(value:number)=>'₹'+Number(value).toLocaleString('en-IN');
        const due:Notice[]=(data.loans as Loan[]).filter(l=>!['closed','foreclosed'].includes(l.status)&&l.balance>0&&l.next_due_date&&l.next_due_date<=today).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date)).map(l=>({
          id:'due:'+l.id+':'+l.next_due_date+':'+(l.next_due_date<today?'overdue':'today')+':'+l.balance,
          title:(l.next_due_date<today?'Overdue loan':'Loan due today')+' · '+l.customer_name,
          detail:l.id+' · Due '+l.next_due_date+' · Outstanding '+money(l.balance),
          target:role==='admin'?'Loans':role==='agent'?'Assigned customers':'My loan'
        }));
        const receipts:Notice[]=(data.collections as Receipt[]).filter(r=>r.collected_at*1000>=Date.now()-7*86400000).sort((a,b)=>b.collected_at-a.collected_at).map(r=>({
          id:'receipt:'+r.id+':'+r.amount,title:'Payment recorded · '+r.customer_name,
          detail:r.id+' · '+money(r.amount)+' · '+new Date(r.collected_at*1000).toLocaleDateString('en-IN'),
          target:role==='customer'?'Repayments':'Collections'
        }));
        if(active&&version===current){setItems([...due,...receipts]);setError('')}
      }catch(err){if(active&&version===current){setError(err instanceof Error?err.message:'Unable to load notifications');setItems([])}}
      finally{if(active&&version===current)setLoading(false)}
    };
    void load();
    const interval=window.setInterval(()=>{if(!document.hidden)void load()},60000);
    window.addEventListener('focus',load);window.addEventListener('fundflow-data',load);
    return()=>{active=false;clearInterval(interval);window.removeEventListener('focus',load);window.removeEventListener('fundflow-data',load)};
  },[userId,role,retry]);
  const markRead=(ids:string[])=>{const next=Array.from(new Set([...read,...ids])).slice(-2000);setRead(next);try{localStorage.setItem(key,JSON.stringify(next))}catch{/* Keep session-only state if storage is unavailable. */}};
  const unread=items.filter(item=>!read.includes(item.id)).length;
  return <>
    <button onClick={()=>{setOpen(true);setRetry(v=>v+1)}} aria-label={'Notifications, '+unread+' unread'} aria-haspopup="dialog" className="relative grid size-9 place-items-center rounded-xl border border-[#dce5e0] bg-white"><Bell className="size-4"/>{unread>0&&<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#df573e] px-1 text-[10px] font-bold text-white">{unread>99?'99+':unread}</span>}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Notifications</DialogTitle><DialogDescription>Due and overdue loans, plus payments from the last 7 days. Read status is saved on this browser.</DialogDescription></DialogHeader>
      <div className="flex justify-between gap-3 text-sm"><button onClick={()=>{setLoading(true);setRetry(v=>v+1)}} className="font-semibold text-[#176447]">Refresh</button><button disabled={!unread} onClick={()=>markRead(items.map(item=>item.id))} className="font-semibold text-[#176447] disabled:opacity-40">Mark all as read</button></div>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto" aria-live="polite">{loading?<p className="py-6 text-center text-sm">Loading notifications…</p>:error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>:items.length===0?<p className="py-6 text-center text-sm">You’re all caught up. No notifications right now.</p>:items.map(item=><button key={item.id} onClick={()=>{markRead([item.id]);setOpen(false);navigate(item.target)}} className={'block w-full rounded-xl border p-3 text-left '+(read.includes(item.id)?'border-[#e3ebe7] bg-white':'border-[#b9d8c9] bg-[#eef7f1]')}><span className="block text-sm font-semibold">{!read.includes(item.id)&&<span aria-label="Unread" className="mr-2 inline-block size-2 rounded-full bg-[#df573e]"/>}{item.title}</span><span className="mt-1 block text-xs text-[#62766e]">{item.detail}</span></button>)}</div>
    </DialogContent></Dialog>
  </>;
}