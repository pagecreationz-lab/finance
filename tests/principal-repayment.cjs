const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)};
const {initializeUpfrontLoan,upfrontCalculation,migrateUpfrontLoan,refreshUpfrontLoan}=require('../lib/upfront-loan.ts');
const make=(basis='daily',rate=10)=>initializeUpfrontLoan({principal:10000,balance:10000,interest_rate:rate,interest_type:'fixed',repayment_frequency:basis,given_date:'2026-10-09',next_due_date:'2026-10-09',status:'active'});
for(const [basis,count,min,max] of [['daily',100,100,100],['weekly',10,1000,1000],['yearly',12,833,834]]){
 const l=make(basis),c=upfrontCalculation(l);assert.equal(l.balance,10000);assert.equal(c.total_repayable,10000);assert.equal(c.interest_amount,1000);assert.equal(c.installment_count,count);assert.equal(c.installment_min,min);assert.equal(c.installment_max,max);assert.equal(c.schedule.reduce((s,r)=>s+r.amount,0),10000);
}
let l={...make(),interest_model:'upfront_net_v1',interest_amount:1000,balance:8910};assert.equal(migrateUpfrontLoan(l),true);assert.equal(l.balance,9910);assert.equal(upfrontCalculation(l).credited_amount,90);assert.equal(upfrontCalculation(l).next_installment_due,10);assert.equal(l.next_due_date,'2026-10-09');assert.equal(migrateUpfrontLoan(l),false);
const previous={...l};l.interest_rate=15;refreshUpfrontLoan(l,previous);assert.equal(l.balance,9910);assert.equal(l.interest_amount,1500);
l.balance-=10;refreshUpfrontLoan(l);assert.equal(l.next_due_date,'2026-10-10');
const oldFlat={...make(),interest_model:'flat_term_v1',interest_amount:1000,balance:10500};assert.equal(migrateUpfrontLoan(oldFlat),true);assert.equal(oldFlat.balance,9500);
const closed={...make(),interest_model:'upfront_net_v1',status:'closed',balance:0};assert.equal(migrateUpfrontLoan(closed),false);assert.equal(closed.balance,0);
console.log('PASS: principal schedules, deductions, rounding, old credits, idempotence and settled loans.');
