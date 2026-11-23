import {flatInterest,loanCalculation,FLAT_MODEL,type CalculatedLoan} from '@/lib/loan-calculation';
import {UPFRONT_MODEL,isUpfrontModel,upfrontInterest} from '@/lib/upfront-loan';
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
export function LoanFinancialSummary({loan,preview=false}:{loan:CalculatedLoan;preview?:boolean}){
 if(!preview&&loan.interest_model!==FLAT_MODEL&&!isUpfrontModel(loan.interest_model))return <p className="text-xs text-[#61786c]">Legacy loan — recorded balance retained. Review before applying upfront deduction.</p>;
 try{
  const interest=preview?upfrontInterest(Number(loan.principal),Number(loan.interest_rate)):Number(loan.interest_amount||0);
  const c=loanCalculation(preview?{...loan,interest_model:UPFRONT_MODEL,balance:Number(loan.principal),status:'active'}:loan);
  return <div className="col-span-full rounded-xl bg-[#eef6f1] p-3 text-sm">
   <p className="font-semibold">{preview||isUpfrontModel(loan.interest_model)?'Upfront interest deducted':'Historical flat interest'} · {loan.interest_rate}% of lending amount</p>
   <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2"><span>Interest: <b>{money(c.interest_amount)}</b></span><span>Customer receives: <b>{money(Number(loan.principal)-interest)}</b></span><span>Total repayable: <b>{money(c.total_repayable)}</b></span><span>{c.installment_count} {loan.repayment_frequency==='yearly'?'monthly':loan.repayment_frequency} installments: <b>{money(c.installment_min)}{c.installment_max!==c.installment_min?'–'+money(c.installment_max):''}</b></span><span>Next installment: <b>{money(c.next_installment_due)}</b> · {c.next_payment_date||'Cleared'}</span></div>
   <p className="mt-2 text-xs">Daily: 100 payments · Weekly: 10 payments · Monthly: select start and end dates. Monthly principal is split across collection dates, including a final partial-period payment on the end date. Interest is deducted once for the entire term. Payments cover the oldest unpaid installments; whole-rupee rounding is distributed exactly.</p>
  </div>;
 }catch{return <p className="col-span-full text-sm text-[#61786c]">Enter the lending amount, deduction rate, loan type, start date and monthly end date to calculate the repayment schedule.</p>}
}
