'use client';
import {useEffect,useState} from 'react';
import {missedInstallments,type PenaltyRequest} from '@/lib/penalties';
import type {StoredLoan} from '@/lib/local-data-store';
type Loan=StoredLoan&{customer_name?:string};
const money=(n:number)=>'₹'+Number(n).toLocaleString('en-IN');
export function PenaltyPanel({role,loans,canRequest=true}:{role:'admin'|'manager'|'agent';loans:Loan[];canRequest?:boolean}){
 const [requests,setRequests]=useState<PenaltyRequest[]>([]),[loanId,setLoanId]=useState(''),[dates,setDates]=useState<string[]>([]),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/penalties',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setRequests(d.requests);setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to load penalties')}}
 useEffect(()=>{void load();const refresh=()=>{void load()};window.addEventListener('fundflow-data',refresh);return()=>window.removeEventListener('fundflow-data',refresh)},[]);
 const eligible=loans.filter(l=>missedInstallments(l).length),loan=eligible.find(l=>l.id===loanId);
 const available=loan?missedInstallments(loan).filter(d=>!requests.some(p=>p.loan_id===loan.id&&p.status!=='rejected'&&p.missed_dates.includes(d))):[];
 async function send(body:Record<string,unknown>){setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/penalties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error);
  setMessage(body.action==='request'?'Penalty submitted for approval. It is not collectible yet.':'Penalty '+(body.action==='approve'?'approved for the next installment.':'rejected.'));
  if(body.action==='request'){setDates([]);setAmount('');setReason('');}await load();window.dispatchEvent(new Event('fundflow-data'));
 }catch(e){setError(e instanceof Error?e.message:'Penalty action failed')}finally{setBusy(false)}}
 return <section className="my-6 rounded-2xl border border-[#dbe5e0] bg-white p-5" aria-label="Missed-day penalties">
  <h2 className="font-bold">Missed-day penalties</h2><p className="mt-1 text-sm text-[#71857c]">Agents enter a total for missed daily installments. Admin Manager or Super Admin approval is required. Approved charges are collected with the next installment, separately from principal.</p>
  {role==='agent'&&canRequest&&<form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void send({action:'request',id:crypto.randomUUID(),loan_id:loanId,amount:Number(amount),missed_dates:dates,reason})}}>
   <label className="grid gap-2 text-sm font-semibold">Customer / loan<select required value={loanId} onChange={e=>{setLoanId(e.target.value);setDates([])}} className="min-w-0 rounded-xl border p-3"><option value="">Select an overdue daily loan</option>{eligible.map(l=><option key={l.id} value={l.id}>{l.customer_name} · {l.loan_number||l.id}</option>)}</select></label>
   <label className="grid gap-2 text-sm font-semibold">Total penalty (₹)<input required type="number" min="1" step="1" max="100000000" value={amount} onChange={e=>setAmount(e.target.value)} className="rounded-xl border p-3" placeholder="Manually entered total"/></label>
   {loan&&<fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">Missed dates ({dates.length} selected)</legend><div className="mt-2 flex max-h-40 flex-wrap gap-3 overflow-y-auto rounded-xl border p-3">{available.map(d=><label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dates.includes(d)} onChange={e=>setDates(e.target.checked?[...dates,d]:dates.filter(v=>v!==d))}/>{d}</label>)}{!available.length&&<p>No uncharged missed dates remain.</p>}</div></fieldset>}
   <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Reason (optional)<input maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="rounded-xl border p-3"/></label>
   <button disabled={busy||!dates.length} className="rounded-xl bg-[#153d30] px-4 py-3 text-white disabled:opacity-50">Submit penalty for approval</button>
  </form>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message&&<p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
  <div className="mt-4 space-y-3">{requests.map(p=><div key={p.id} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{loans.find(l=>l.id===p.loan_id)?.customer_name||'Customer'} · {loans.find(l=>l.id===p.loan_id)?.loan_number||p.loan_id}</b><b>{money(p.amount)} · <span className="capitalize">{p.status}</span></b></div><p className="mt-1">Missed: {p.missed_dates.join(', ')}</p><p>{p.reason||'No reason entered'} · Requested by {p.requested_name}</p>{p.reviewed_name&&<p>Reviewed by {p.reviewed_name}</p>}{p.receipt_id&&<p>Collected on receipt {p.receipt_id}</p>}{role!=='agent'&&p.status==='pending'&&<div className="mt-3 flex gap-3"><button disabled={busy} className="rounded-lg bg-[#153d30] px-4 py-2 text-white" onClick={()=>void send({action:'approve',id:p.id})}>Approve</button><button disabled={busy} className="rounded-lg border px-4 py-2" onClick={()=>void send({action:'reject',id:p.id})}>Reject</button></div>}</div>)}{!requests.length&&!error&&<p className="text-sm text-[#71857c]">No penalty requests.</p>}</div>
 </section>;
}
