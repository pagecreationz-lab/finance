'use client';
import {useState} from 'react';
type Loan={loan_number?:string|null;id:string;customer_name:string;phone?:string;balance:number;principal:number;repayment_frequency:string;given_date:string};
export function CollectionLoanPicker({loans,value,onChange}:{loans:Loan[];value:string;onChange:(id:string)=>void}){
 const [query,setQuery]=useState('');
 const term=query.trim().toLowerCase();
 const matches=term?loans.filter(l=>[l.customer_name,l.phone,l.loan_number,l.id].some(v=>String(v||'').toLowerCase().includes(term))):[];
 const money=(amount:number)=>'₹'+Number(amount).toLocaleString('en-IN');
 return <div className="min-w-0 space-y-2">
  <input type="search" aria-label="Search collection customers or loans" placeholder="Search customer name, phone or loan number" value={query} onChange={e=>{setQuery(e.target.value);onChange('')}} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"/>
  <div aria-label="Matching customer loans" className="max-h-60 space-y-2 overflow-y-auto">
   {matches.map(l=><button type="button" key={l.id} aria-pressed={value===l.id} onClick={()=>onChange(l.id)} className={'block w-full rounded-xl border p-3 text-left text-sm '+(value===l.id?'border-[#176447] bg-[#eef7f1]':'border-[#dce5e0] bg-white hover:bg-[#f5f8f6]')}>
    <span className="flex flex-wrap justify-between gap-2"><strong>{l.customer_name}</strong><strong>{money(l.balance)}{value===l.id?' · Selected':''}</strong></span>
    <span className="mt-1 block text-xs font-normal text-[#71857c]">{l.phone?l.phone+' · ':''}{l.repayment_frequency} · Started {l.given_date} · Principal {money(l.principal)}</span>
   </button>)}
  </div>
  {term&&<p role="status" className="text-xs font-normal text-[#71857c]">{matches.length?matches.length+' matching loan'+(matches.length===1?'':'s'):'No matching loans found.'}{!value?' Choose a result before recording payment.':''}</p>}
 </div>;
}
