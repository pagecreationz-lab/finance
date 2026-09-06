import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type StoredUser = { id:string; name:string; phone:string; email:string|null; role:string; assigned_agent_id:string|null; created_at:number };
export type StoredLoan = { id:string; customer_id:string; principal:number; balance:number; interest_type:string; interest_rate:number; repayment_frequency:string; given_date:string; next_due_date:string; security_type:string; security_file_key:string|null; remarks:string|null; status:string };
export type StoredCollection = { id:string; loan_id:string; agent_id:string; amount:number; method:string; proof_file_key:string|null; remarks:string|null; collected_at:number };
export type LocalFinanceData = { users:StoredUser[]; loans:StoredLoan[]; collections:StoredCollection[] };

const dataPath = () => process.env.FUNDFLOW_LOCAL_DATA_PATH || path.join(process.cwd(), '.local-data', 'fundflow.json');
const seedData: LocalFinanceData = {
  users: [
    { id:'agent-deepak', name:'Deepak Singh', phone:'+91 90000 10001', email:'deepak@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361200 },
    { id:'agent-meera', name:'Meera Joshi', phone:'+91 90000 10002', email:'meera@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361260 },
    { id:'agent-akash', name:'Akash Verma', phone:'+91 90000 10003', email:'akash@fundflow.local', role:'agent', assigned_agent_id:null, created_at:1725361320 },
    { id:'customer-arjun', name:'Arjun Mehta', phone:'+91 98765 43010', email:'arjun@example.com', role:'customer', assigned_agent_id:'agent-deepak', created_at:1725361380 },
    { id:'customer-priya', name:'Priya Sharma', phone:'+91 97654 22981', email:'priya@example.com', role:'customer', assigned_agent_id:'agent-meera', created_at:1725361440 },
    { id:'customer-ravi', name:'Ravi Kumar', phone:'+91 99887 10242', email:'ravi@example.com', role:'customer', assigned_agent_id:'agent-deepak', created_at:1725361500 },
    { id:'customer-neha', name:'Neha Patel', phone:'+91 91234 56908', email:'neha@example.com', role:'customer', assigned_agent_id:'agent-meera', created_at:1725361560 },
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
};
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
  try { return JSON.parse(await readFile(/* turbopackIgnore: true */ file, 'utf8')) as LocalFinanceData; }
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
    const result = await mutator(data);
    await writeStore(data);
    return result;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}


