'use client';
import {useState} from 'react';
import {CollectionLedger} from './collection-ledger';
import {categorizeCollections,collectionViews} from '@/lib/collection-frequency';
export function AgentCollectionLedger({loans,receipts}:{loans:{id:string;repayment_frequency:string}[];receipts:{loan_id:string;amount:number;collected_at:number}[]}){
  const [frequency,setFrequency]=useState('daily');
  const grouped=categorizeCollections(loans,receipts,frequency);
  return <section className="my-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">My collection ledger</h2><p className="text-xs text-[#71857c]">Read-only. Your recorded payments for currently assigned customers. Only the super admin can make permitted receipt corrections.</p></div><select aria-label="Collection ledger return basis" value={frequency} onChange={e=>setFrequency(e.target.value)} className="rounded-lg border bg-white p-2 text-sm">{collectionViews.map(view=><option key={view.frequency} value={view.frequency}>{view.label}</option>)}</select></div><CollectionLedger key={frequency} receipts={grouped.collections} frequency={frequency}/></section>;
}