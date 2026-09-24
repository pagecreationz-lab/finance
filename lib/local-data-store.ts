import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReminderStore } from './reminder-types';

export type StoredUser = { id:string; name:string; phone:string; email:string|null; role:string; assigned_agent_id:string|null; created_at:number; occupation?:string|null; username?:string|null; password_hash?:string|null };
export type StoredLoan = { id:string; customer_id:string; principal:number; balance:number; interest_type:string; interest_rate:number; repayment_frequency:string; end_date?:string|null; given_date:string; next_due_date:string; security_type:string; security_file_key:string|null; remarks:string|null; status:string; foreclosed_at?:number|null; foreclosure_amount?:number|null; foreclosure_waived?:number|null; foreclosure_proof_file_key?:string|null; foreclosure_remarks?:string|null; foreclosed_by?:string|null; reopened_at?:number|null; reopen_reason?:string|null; reopened_by?:string|null };
export type StoredCollection = { customer_signature?:number[][][]|null; signature_at?:number|null; id:string; loan_id:string; agent_id:string|null; collected_by_name?:string; amount:number; method:string; proof_file_key:string|null; remarks:string|null; collected_at:number };
export type StoredAuditLog = { id:string; actor_id:string; actor_name:string; actor_role:string; action:string; entity_type:string; entity_id:string|null; summary:string; metadata:Record<string,unknown>; created_at:number };
export type LocalFinanceData = { receipt_corrections?:import('./receipt-corrections').ReceiptCorrection[]; role_permissions?:import("./permissions").Policy; users:StoredUser[]; loans:StoredLoan[]; collections:StoredCollection[]; audit_logs:StoredAuditLog[]; reminders?:ReminderStore };

const dataPath = () => process.env.FUNDFLOW_LOCAL_DATA_PATH || path.join(process.cwd(), '.local-data', 'fundflow.json');
const agentHash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d';
const customerHash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0';
const seedData: LocalFinanceData = {
  users: [
    { id:'agent-deepak', username:'deepak', password_hash:agentHash, name:'Deepak Singh', phone:'+91 90000 10001', email:'deepak@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361200 },
    { id:'agent-meera', username:'meera', password_hash:agentHash, name:'Meera Joshi', phone:'+91 90000 10002', email:'meera@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361260 },
    { id:'agent-akash', username:'akash', password_hash:agentHash, name:'Akash Verma', phone:'+91 90000 10003', email:'akash@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361320 },
    { id:'customer-arjun', username:'arjun', password_hash:customerHash, name:'Arjun Mehta', phone:'+91 98765 43010', email:'arjun@example.com', role:'customer', assigned_agent_id:'agent-deepak', created_at:1725361380 },
    { id:'customer-priya', username:'priya', password_hash:customerHash, name:'Priya Sharma', phone:'+91 97654 22981', email:'priya@example.com', role:'customer', assigned_agent_id:'agent-meera', created_at:1725361440 },
    { id:'customer-ravi', username:'ravi', password_hash:customerHash, name:'Ravi Kumar', phone:'+91 99887 10242', email:'ravi@example.com', role:'customer', assigned_agent_id:'agent-deepak', created_at:1725361500 },
    { id:'customer-neha', username:'neha', password_hash:customerHash, name:'Neha Patel', phone:'+91 91234 56908', email:'neha@example.com', role:'customer', assigned_agent_id:'agent-meera', created_at:1725361560 },
  ],
  loans: [
    { id:'LN-2048', customer_id:'customer-arjun', principal:250000, balance:182400, interest_type:'fixed', interest_rate:16, repayment_frequency:'weekly', given_date:'2026-05-09', next_due_date:'2026-09-06', security_type:'asset', security_file_key:null, remarks:'Property security', status:'active' },
    { id:'LN-2047', customer_id:'customer-priya', principal:120000, balance:84000, interest_type:'floating', interest_rate:14.5, repayment_frequency:'monthly', given_date:'2026-04-08', next_due_date:'2026-09-08', security_type:'surety', security_file_key:null, remarks:'Personal surety', status:'active' },
    { id:'LN-2046', customer_id:'customer-ravi', principal:400000, balance:344800, interest_type:'fixed', interest_rate:18, repayment_frequency:'weekly', given_date:'2026-03-02', next_due_date:'2026-09-02', security_type:'asset', security_file_key:null, remarks:'Vehicle security', status:'active' },
    { id:'LN-2045', customer_id:'customer-neha', principal:75000, balance:22500, interest_type:'fixed', interest_rate:12, repayment_frequency:'monthly', given_date:'2026-02-18', next_due_date:'2026-09-18', security_type:'surety', security_file_key:null, remarks:null, status:'active' },
  ],
  collections: [
    { id:'RC-8391', loan_id:'LN-2048', agent_id:'agent-deepak', amount:12500, method:'UPI', proof_file_key:null, remarks:null, collected_at:1788662520 },
    { id:'RC-8390', loan_id:'LN-2047', agent_id:'agent-meera', amount:8000, method:'Cash', proof_file_key:null, remarks:null, collected_at:1788661080 },
    { id:'RC-8389', loan_id:'LN-2045', agent_id:'agent-meera', amount:6250, method:'Bank transfer', proof_file_key:null, remarks:null, collected_at:1788658560 },
  ],
  audit_logs: [],
};
function normalizeUsers(data:LocalFinanceData){
  data.audit_logs??=[];
  const usernames:Record<string,string>={'agent-deepak':'deepak','agent-meera':'meera','agent-akash':'akash','customer-arjun':'arjun','customer-priya':'priya','customer-ravi':'ravi','customer-neha':'neha'};
  for(const user of data.users){
    user.username??=usernames[user.id]||null;
    user.password_hash??=user.role==='agent'?agentHash:user.role==='customer'?customerHash:null;
  }
  return data;
}
let mutationQueue: Promise<unknown> = Promise.resolve();
async function writeStore(data: LocalFinanceData) {
  const file = dataPath();
  await mkdir(path.dirname(file), { recursive:true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporary, file);
}
export async function readLocalStore(): Promise<LocalFinanceData> {
  const file = dataPath();
  try { return normalizeUsers(JSON.parse(await readFile(/* turbopackIgnore: true */ file, 'utf8')) as LocalFinanceData); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const initial = structuredClone(seedData);
    await writeStore(initial);
    return initial;
  }
}
export function mutateLocalStore<T>(mutator:(data:LocalFinanceData)=>T|Promise<T>): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const data = await readLocalStore();
    const previousLogs = new Map(data.audit_logs.map(log=>[log.id,JSON.stringify(log)]));
    const previousCorrections=structuredClone(data.receipt_corrections||[]);
    const result = await mutator(data);
    const nextLogs = new Map(data.audit_logs.map(log=>[log.id,JSON.stringify(log)]));
    if(nextLogs.size!==data.audit_logs.length||[...previousLogs].some(([id,value])=>nextLogs.get(id)!==value))throw new Error('Audit logs cannot be edited or deleted');
    for(const old of previousCorrections){
      const next=(data.receipt_corrections||[]).find(c=>c.id===old.id);
      if(!next)throw new Error('Correction history cannot be deleted');
      if(JSON.stringify(old)===JSON.stringify(next))continue;
      if(old.status!=='pending'||!['approved','rejected'].includes(next.status))throw new Error('Correction decisions are immutable');
      const decisionFields=new Set(['status','reviewed_by','reviewed_name','review_reason','reviewed_at','applied_sequence']);
      for(const field of new Set([...Object.keys(old),...Object.keys(next)]))if(!decisionFields.has(field)&&JSON.stringify(old[field as keyof typeof old])!==JSON.stringify(next[field as keyof typeof next]))throw new Error('Correction proposals are immutable');
    }
    await writeStore(data);
    return result;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

