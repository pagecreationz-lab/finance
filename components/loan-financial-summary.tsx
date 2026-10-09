import {flatInterest,loanCalculation,FLAT_MODEL,type CalculatedLoan} from '@/lib/loan-calculation';
import {UPFRONT_MODEL,upfrontInterest} from '@/lib/upfront-loan';
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
export function LoanFinancialSummary({loan,preview=false}:{loan:CalculatedLoan;preview?:boolean}){
 if(!preview&&loan.interest_model!==FLAT_MODEL&&loan.interest_model!==UPFRONT_MODEL)return <p className="text-xs text-[#61786c]">Legacy loan — recorded balance retained. Review before applying upfront deduction.</p>;
 try{
  const interest=preview?upfrontInterest(Number(loan.principal),Number(loan.interest_rate)):Number(loan.interest_amount||0);
  const c=loanCalculation(preview?{...loan,interest_model:UPFRONT_MODEL,balance:Number(loan.principal)-interest,status:'active'}:loan);
  return <div className="col-span-full rounded-xl bg-[#eef6f1] p-3 text-sm">
   <p className="font-semibold">{preview||loan.interest_model===UPFRONT_MODEL?'Upfront interest deducted':'Historical flat interest'} · {loan.interest_rate}% of lending amount</p>
   <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2"><span>Interest: <b>{money(c.interest_amount)}</b></span><span>Total repayable: <b>{money(c.total_repayable)}</b></span><span>{c.installment_count} {loan.repayment_frequency==='yearly'?'monthly':loan.repayment_frequency} installments: <b>{money(c.installment_min)}{c.installment_max!==c.installment_min?'–'+money(c.installment_max):''}</b></span><span>Next installment: <b>{money(c.next_installment_due)}</b> · {c.next_payment_date||'Cleared'}</span></div>
   <p className="mt-2 text-xs">Daily: 100 payments · Weekly: 10 payments · Yearly: 12 monthly payments. Dates are automatic from the start date. Payments cover the oldest unpaid installments; whole-rupee rounding is distributed exactly.</p>
  </div>;
 }catch{return <p className="col-span-full text-sm text-[#61786c]">Enter the lending amount, deduction rate, loan type and start date to calculate the repayment schedule.</p>}
}
