'use client';
import {useState} from 'react';
import {SelectedLoanLedger,type LedgerLoan} from './selected-loan-ledger';
export function CollectionLedger({receipts,frequency,loans}:{receipts:{loan_id:string;amount:number;collected_at:number}[];frequency:string;loans:LedgerLoan[]}){
 const [id,setId]=useState('');
 const selected=loans.find(l=>l.id===id)||loans[0];
 return <section className="mt-6 rounded-2xl border bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold capitalize">{frequency==='yearly'?'Monthly':frequency} collection ledger</h2>{loans.length>0&&<label className="text-sm">Customer / loan <select aria-label="Ledger customer and loan" value={selected?.id||''} onChange={e=>setId(e.target.value)} className="max-w-full rounded border p-2">{loans.map(l=><option key={l.id} value={l.id}>{l.customer_name} · {l.given_date} · ₹{Number(l.principal).toLocaleString('en-IN')}</option>)}</select></label>}</div>{selected?<SelectedLoanLedger key={selected.id} loan={selected} receipts={receipts}/>:<p className="text-sm text-[#71857c]">No loans in this collection category.</p>}</section>;
}
