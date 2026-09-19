export const collectionViews = [
  {label:'Daily Collections',frequency:'daily'},
  {label:'Weekly Collections',frequency:'weekly'},
  {label:'Monthly Collections',frequency:'monthly'},
] as const;
export function categorizeCollections<L extends {id:string;repayment_frequency:string}, C extends {loan_id:string}>(loans:L[],collections:C[],frequency?:string){
  const selectedLoans=frequency?loans.filter(loan=>loan.repayment_frequency.toLowerCase()===frequency):loans;
  const ids=new Set(selectedLoans.map(loan=>loan.id));
  return {loans:selectedLoans,collections:frequency?collections.filter(receipt=>ids.has(receipt.loan_id)):collections};
}
