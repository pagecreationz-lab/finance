'use client';
import {loanLedger} from '@/lib/loan-ledger';
type Loan={id:string;customer_name:string;repayment_frequency:string;principal:number;balance:number;given_date:string;end_date?:string|null};
type Receipt={loan_id:string;amount:number;collected_at:number};
export function SelectedLoanLedger({loan,receipts}:{loan?:Loan;receipts:Receipt[]}){
 if(!loan)return null;
 const selected=receipts.filter(r=>r.loan_id===loan.id);
 const frequency=loan.repayment_frequency;
 const rows=loanLedger(selected,frequency,loan.given_date,loan.end_date||loan.given_date);
 const money=(v:number)=>'₹'+Number(v).toLocaleString('en-IN');
 return <section className="sm:col-span-2 min-w-0 rounded-xl border p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold capitalize">{frequency==="yearly"?"Monthly":frequency} collection ledger</h3><span className="text-sm">From {loan.given_date}</span></div>
  <p className="my-2 text-xs text-[#71857c]">{loan.customer_name} · Principal {money(loan.principal)} · Balance {money(loan.balance)}. Saved receipts only; this payment appears after saving.</p>
  <div className="max-h-64 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Period</th><th>Receipts</th><th className="text-right">Collected</th></tr></thead><tbody>{rows.map(r=><tr key={r.label} className="border-t"><td className="p-2">{r.label}</td><td>{r.count}</td><td className="text-right">{money(r.amount)}</td></tr>)}</tbody><tfoot><tr className="border-t font-bold"><td className="p-2">Total</td><td>{rows.reduce((n,r)=>n+r.count,0)}</td><td className="text-right">{money(rows.reduce((n,r)=>n+r.amount,0))}</td></tr></tfoot></table></div>
 </section>;
}
