const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/collection-frequency.ts'),'utf8');
const moduleOutput={exports:{}};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleOutput.exports);
const {categorizeCollections}=moduleOutput.exports;
const loans=[{id:'d',repayment_frequency:'Daily'},{id:'w',repayment_frequency:'weekly'},{id:'m',repayment_frequency:'monthly'},{id:'y',repayment_frequency:'yearly'},{id:'new',repayment_frequency:'daily'}];
const receipts=[{id:1,loan_id:'d',amount:10},{id:2,loan_id:'w',amount:20},{id:3,loan_id:'m',amount:30},{id:4,loan_id:'y',amount:40},{id:5,loan_id:'missing',amount:50}];
for(const [frequency,id,total] of [['daily','d',10],['weekly','w',20],['monthly','m',30]]){const result=categorizeCollections(loans,receipts,frequency);assert.equal(result.collections.length,1);assert.equal(result.collections[0].loan_id,id);assert.equal(result.collections.reduce((s,r)=>s+r.amount,0),total);}
assert.equal(categorizeCollections(loans,receipts,'daily').loans.length,2);
assert.equal(categorizeCollections(loans,receipts).collections.length,5);
assert.equal(categorizeCollections(loans,receipts).loans.length,5);
assert.deepEqual(categorizeCollections([],receipts,'daily'),{loans:[],collections:[]});
console.log('PASS: daily/weekly/monthly loan and receipt grouping, category totals, new unpaid loans, mixed-case frequency, yearly/all view and empty states.');