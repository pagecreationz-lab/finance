const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)};
const {loanLedger}=require('../lib/loan-ledger.ts');
const receipt=(date,amount)=>({collected_at:Date.parse(date)/1000,amount});
for(const [frequency,count,first,last] of [['daily',100,'2026-10-09','2027-01-16'],['weekly',10,'2026-10-16','2026-12-18'],['monthly',12,'2026-11-09','2027-10-09'],['yearly',12,'2026-11-09','2027-10-09']]){
 const rows=loanLedger([receipt('2026-10-08T00:00:00Z',10),receipt('2030-01-01T00:00:00Z',50)],frequency,'2026-10-09',frequency==='monthly'?'2027-10-09':'2035-01-01');
 assert.equal(rows.length,count);assert.equal(rows[0].date,first);assert.equal(rows.at(-1).date,last);assert.equal(rows[0].amount,10);assert.equal(rows.at(-1).amount,50);assert.equal(rows.reduce((s,r)=>s+r.count,0),2);
}
let rows=loanLedger([receipt('2026-10-09T20:00:00Z',90)],'daily','2026-10-09');assert.equal(rows[0].amount,0);assert.equal(rows[1].amount,90);
rows=loanLedger([],'monthly','2028-01-31','2029-01-31');assert.equal(rows[0].date,'2028-02-29');assert.equal(rows[1].date,'2028-03-31');assert.equal(rows.length,12);
rows=loanLedger([],'monthly','2026-01-31','2026-05-15');assert.deepEqual(rows.map(r=>r.date),['2026-02-28','2026-03-31','2026-04-30','2026-05-15']);
assert.deepEqual(loanLedger([],'daily',''),[]);
console.log('PASS: exactly 100 daily/10 weekly/12 monthly rows, scheduled dates, IST boundaries, leap dates and early/late receipt totals.');
