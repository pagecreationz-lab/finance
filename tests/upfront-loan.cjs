const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)};
const {upfrontInterest,upfrontTerms,initializeUpfrontLoan,upfrontCalculation,refreshUpfrontLoan,migrateUpfrontLoan}=require('../lib/upfront-loan.ts');
const make=(frequency='daily')=>initializeUpfrontLoan({principal:10000,balance:10000,interest_rate:10,interest_type:'fixed',repayment_frequency:frequency,given_date:'2026-10-08',next_due_date:'1900-01-01',end_date:'1900-01-01',status:'active'});
for(const [basis,count,amount] of [['daily',100,90],['weekly',10,900],['yearly',12,750],['monthly',12,750]]){
 const l=make(basis),c=upfrontCalculation(l);assert.equal(l.balance,9000);assert.equal(c.interest_amount,1000);assert.equal(c.total_repayable,9000);assert.equal(c.installment_count,count);assert.equal(c.installment_min,amount);assert.equal(c.schedule.reduce((n,r)=>n+r.amount,0),9000);
}
assert.equal(upfrontInterest(10000,15),1500);assert.equal(upfrontInterest(10000,0),0);
assert.equal(upfrontTerms('2026-10-08','daily').end_date,'2027-01-15');
assert.equal(upfrontTerms('2026-10-08','weekly').end_date,'2026-12-17');
assert.deepEqual(upfrontTerms('2028-01-31','yearly').dates.slice(0,3),['2028-02-29','2028-03-31','2028-04-30']);
for(const rate of [-1,100,NaN,1.12345])assert.throws(()=>upfrontInterest(10000,rate));
let l=make(),old=structuredClone(l);l.balance-=45;refreshUpfrontLoan(l,old);assert.equal(l.next_due_date,'2026-10-08');assert.equal(upfrontCalculation(l).next_installment_due,45);
old=structuredClone(l);l.balance-=45;refreshUpfrontLoan(l,old);assert.equal(l.next_due_date,'2026-10-09');
old=structuredClone(l);l.balance+=1;refreshUpfrontLoan(l,old);assert.equal(l.next_due_date,'2026-10-08');
old=structuredClone(l);l.interest_rate=15;refreshUpfrontLoan(l,old);assert.equal(l.balance,8500-89);
old=structuredClone(l);l.balance=0;refreshUpfrontLoan(l,old);assert.equal(l.status,'closed');
old=structuredClone(l);l.balance=100;refreshUpfrontLoan(l,old);assert.ok(l.next_due_date>'2026-10-09');
const legacy={...make(),interest_model:'flat_term_v1',interest_amount:1000,balance:10500};assert.equal(migrateUpfrontLoan(legacy),true);assert.equal(legacy.balance,8500);assert.equal(migrateUpfrontLoan(legacy),false);
const excessive={...make(),interest_model:'flat_term_v1',balance:1000};assert.equal(migrateUpfrontLoan(excessive),false);assert.equal(excessive.balance,1000);
const {categorizeCollections}=require('../lib/collection-frequency.ts');assert.equal(categorizeCollections([{...make('yearly'),id:'x'}],[],'monthly').loans.length,1);
console.log('PASS: upfront deductions, variable rates, exact 100/10/12 schedules, leap/month ends, payment/reversal/rate adjustments, credit-preserving migration and monthly collection grouping.');
