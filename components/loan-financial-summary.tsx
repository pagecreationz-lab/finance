import {flatInterest,loanCalculation,FLAT_MODEL,type CalculatedLoan} from '@/lib/loan-calculation';
const money=(n:number)=>'₹'+n.toLocaleString('en-IN');
export function LoanFinancialSummary({loan,preview=false}:{loan:CalculatedLoan;preview?:boolean}){
 if(!preview&&loan.interest_model!==FLAT_MODEL)return <p className="text-xs text-[#61786c]">Legacy loan — recorded balance retained; flat-term schedule not available.</p>;
 try{
  const interest=flatInterest(Number(loan.principal),Number(loan.interest_rate));
  const c=loanCalculation(preview?{...loan,balance:Number(loan.principal)+interest,status:'active'}:loan);
  return <div className="col-span-full rounded-xl bg-[#eef6f1] p-3 text-sm">
   <p className="font-semibold">Flat interest · {loan.interest_rate}% of original principal for the entire term</p>
   <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2"><span>Interest: <b>{money(c.interest_amount)}</b></span><span>Total repayable: <b>{money(c.total_repayable)}</b></span><span>{c.installment_count} {loan.repayment_frequency} installments: <b>{money(c.installment_min)}{c.installment_max!==c.installment_min?'–'+money(c.installment_max):''}</b></span><span>Next installment: <b>{money(c.next_installment_due)}</b> · {c.next_payment_date||'Cleared'}</span></div>
   <p className="mt-2 text-xs">Payments cover the oldest unpaid installments first. Whole-rupee rounding is distributed across installments; the final due date is the loan end date.</p>
  </div>;
 }catch{return <p className="col-span-full text-sm text-[#61786c]">Enter a valid principal, term rate, first due date and end date to calculate installments.</p>}
}
