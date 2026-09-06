import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { headers } from 'next/headers';

const ADMIN_EMAILS = new Set(['seedy@sites.test']);
const now = Math.floor(Date.now() / 1000);

async function requestHeaders(request?:Request) {
  return request?.headers ?? await headers();
}

async function isLocalRequest(request?:Request) {
  if(request?.url){
    const hostname=new URL(request.url).hostname;
    if(hostname==='localhost'||hostname==='127.0.0.1') return true;
  }
  const host=(await requestHeaders(request)).get('host')||'';
  return host.startsWith('localhost:')||host==='localhost'||host.startsWith('127.0.0.1:')||host==='127.0.0.1';
}

async function isAdmin(request?: Request) {
  const user = await getChatGPTUser();
  if (user !== null && ADMIN_EMAILS.has(user.email.toLowerCase())) return true;
  return isLocalRequest(request);
}

let databasePrepared=false;

async function prepareDatabase() {
  if(databasePrepared) return;
  databasePrepared=true;
  try {
  const db = env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, role TEXT NOT NULL, assigned_agent_id TEXT, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, principal INTEGER NOT NULL, balance INTEGER NOT NULL, interest_type TEXT NOT NULL, interest_rate REAL NOT NULL, repayment_frequency TEXT NOT NULL, given_date TEXT NOT NULL, next_due_date TEXT NOT NULL, security_type TEXT NOT NULL, security_file_key TEXT, remarks TEXT, status TEXT NOT NULL DEFAULT 'active')"),
    db.prepare("CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, loan_id TEXT NOT NULL, agent_id TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, proof_file_key TEXT, remarks TEXT, collected_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_users_assigned_agent ON users(assigned_agent_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_collections_loan_id ON collections(loan_id)")
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>();
  if ((count?.count ?? 0) > 0) return;
  await db.batch([
    db.prepare("INSERT INTO users (id,name,phone,email,role,created_at) VALUES (?,?,?,?,?,?)").bind('agent-deepak','Deepak Singh','+91 98700 12001','deepak@fundflow.local','agent',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,created_at) VALUES (?,?,?,?,?,?)").bind('agent-meera','Meera Joshi','+91 98700 12002','meera@fundflow.local','agent',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,created_at) VALUES (?,?,?,?,?,?)").bind('agent-akash','Akash Verma','+91 98700 12003','akash@fundflow.local','agent',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,assigned_agent_id,created_at) VALUES (?,?,?,?,?,?,?)").bind('customer-arjun','Arjun Mehta','+91 98765 43010','arjun@example.com','customer','agent-deepak',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,assigned_agent_id,created_at) VALUES (?,?,?,?,?,?,?)").bind('customer-priya','Priya Sharma','+91 97654 22981','priya@example.com','customer','agent-meera',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,assigned_agent_id,created_at) VALUES (?,?,?,?,?,?,?)").bind('customer-ravi','Ravi Kumar','+91 99887 10242','ravi@example.com','customer','agent-deepak',now),
    db.prepare("INSERT INTO users (id,name,phone,email,role,assigned_agent_id,created_at) VALUES (?,?,?,?,?,?,?)").bind('customer-neha','Neha Patel','+91 91234 56908','neha@example.com','customer','agent-meera',now),
    db.prepare("INSERT INTO loans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind('LN-2048','customer-arjun',250000,182400,'fixed',16,'weekly','2026-03-12','2026-09-05','asset','Property deed.pdf','Commercial expansion','active'),
    db.prepare("INSERT INTO loans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind('LN-2047','customer-priya',120000,84000,'floating',14.5,'monthly','2026-04-20','2026-09-08','asset','Gold valuation.jpg','Working capital','active'),
    db.prepare("INSERT INTO loans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind('LN-2046','customer-ravi',400000,344800,'fixed',18,'weekly','2026-02-05','2026-09-02','surety','Surety letter.pdf','Equipment purchase','overdue'),
    db.prepare("INSERT INTO loans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind('LN-2045','customer-neha',75000,22500,'fixed',12,'monthly','2026-06-18','2026-09-12','asset','Vehicle RC.jpg','Personal loan','active'),
    db.prepare("INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)").bind('RC-8391','LN-2048','agent-deepak',12500,'UPI','payment-proof-RC-8391.jpg','Payment verified',now),
    db.prepare("INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)").bind('RC-8390','LN-2047','agent-meera',8000,'Cash',null,'Cash receipt recorded',now-1200),
    db.prepare("INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)").bind('RC-8389','LN-2045','agent-meera',6250,'Bank transfer','payment-proof-RC-8389.jpg','Transfer verified',now-3600)
  ]);
  } catch(error) {
    databasePrepared=false;
    throw error;
  }
}

export async function GET(request?: Request) {
  if ((await isAdmin(request)) === false) return Response.json({error:'Super admin access required'},{status:403});
  await prepareDatabase();
  const db = env.DB;
  const [customers,loans,collections,agents,summary] = await Promise.all([
    db.prepare("SELECT u.id,u.name,u.phone,u.email,u.assigned_agent_id,a.name AS agent_name,COUNT(l.id) AS active_loans,COALESCE(SUM(l.balance),0) AS outstanding,'Verified' AS kyc FROM users u LEFT JOIN users a ON a.id=u.assigned_agent_id LEFT JOIN loans l ON l.customer_id=u.id AND l.status!='closed' WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at").all(),
    db.prepare("SELECT l.*,u.name AS customer_name,u.phone,a.name AS agent_name,COALESCE((SELECT SUM(c.amount) FROM collections c WHERE c.loan_id=l.id),0) AS paid FROM loans l JOIN users u ON u.id=l.customer_id LEFT JOIN users a ON a.id=u.assigned_agent_id ORDER BY l.given_date DESC").all(),
    db.prepare("SELECT c.*,u.name AS customer_name,a.name AS agent_name,l.balance AS loan_balance FROM collections c JOIN loans l ON l.id=c.loan_id JOIN users u ON u.id=l.customer_id JOIN users a ON a.id=c.agent_id ORDER BY c.collected_at DESC").all(),
    db.prepare("SELECT a.id,a.name,a.phone,a.email,COUNT(DISTINCT u.id) AS assigned,COALESCE(SUM(c.amount),0) AS collected FROM users a LEFT JOIN users u ON u.assigned_agent_id=a.id LEFT JOIN collections c ON c.agent_id=a.id WHERE a.role='agent' GROUP BY a.id ORDER BY a.created_at").all(),
    db.prepare("SELECT (SELECT COUNT(*) FROM users WHERE role='customer') AS customer_count,(SELECT COUNT(*) FROM loans) AS loan_count,(SELECT COALESCE(SUM(principal),0) FROM loans) AS disbursed,(SELECT COALESCE(SUM(balance),0) FROM loans WHERE status!='closed') AS outstanding,(SELECT COALESCE(SUM(amount),0) FROM collections) AS collected,(SELECT COUNT(*) FROM users WHERE role='agent') AS agent_count").first()
  ]);
  return Response.json({customers:customers.results,loans:loans.results,collections:collections.results,agents:agents.results,summary});
}

export async function POST(request:Request) {
  const body=await request.json() as Record<string,unknown>;
  const action=String(body.action||'');

  if ((await isAdmin(request)) === false) return Response.json({error:'Super admin access required'},{status:403});
  await prepareDatabase();
  const db=env.DB;
  if(action==='create_customer'){
    await db.prepare("INSERT INTO users (id,name,phone,email,role,assigned_agent_id,created_at) VALUES (?,?,?,?,?,?,?)").bind('customer-'+crypto.randomUUID(),String(body.name||''),String(body.phone||''),String(body.email||''),'customer',String(body.agent_id||'agent-deepak'),now).run();
  } else if(action==='update_customer'){
    await db.prepare("UPDATE users SET name=?,phone=?,email=? WHERE id=? AND role='customer'").bind(String(body.name),String(body.phone),String(body.email||''),String(body.id)).run();
  } else if(action==='delete_customers'){
    const ids=Array.isArray(body.ids)?body.ids.map(String):[];
    if(ids.length) await db.batch(ids.map(id=>db.prepare("DELETE FROM users WHERE id=? AND role='customer' AND NOT EXISTS (SELECT 1 FROM loans WHERE customer_id=?)").bind(id,id)));
  } else if(action==='assign_customer'){
    await db.prepare("UPDATE users SET assigned_agent_id=? WHERE id=? AND role='customer'").bind(String(body.agent_id),String(body.customer_id)).run();
  } else if(action==='create_loan'){
    const principal=Number(body.principal);
    if(!String(body.customer_id||'')||!Number.isFinite(principal)||principal<=0) return Response.json({error:'Customer and valid principal are required'},{status:400});
    const id='LN-'+crypto.randomUUID().slice(0,8).toUpperCase();
    await db.prepare("INSERT INTO loans (id,customer_id,principal,balance,interest_type,interest_rate,repayment_frequency,given_date,next_due_date,security_type,security_file_key,remarks,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,String(body.customer_id),principal,principal,String(body.interest_type||'fixed'),Number(body.interest_rate||0),String(body.repayment_frequency||'monthly'),String(body.given_date),String(body.next_due_date),String(body.security_type||'asset'),String(body.security_file_key||''),String(body.remarks||''),'active').run();
  } else if(action==='create_collection'){
    const amount=Number(body.amount);
    const loanId=String(body.loan_id||'');
    if(!loanId||!Number.isFinite(amount)||amount<=0) return Response.json({error:'Loan and valid collection amount are required'},{status:400});
    const loan=await db.prepare("SELECT balance FROM loans WHERE id=?").bind(loanId).first<{balance:number}>();
    if(!loan) return Response.json({error:'Loan not found'},{status:404});
    if(amount>loan.balance) return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});
    const id='RC-'+crypto.randomUUID().slice(0,8).toUpperCase();
    await db.batch([
      db.prepare("INSERT INTO collections (id,loan_id,agent_id,amount,method,proof_file_key,remarks,collected_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,loanId,String(body.agent_id||'agent-deepak'),amount,String(body.method||'Cash'),String(body.proof_file_key||''),String(body.remarks||''),Math.floor(Date.now()/1000)),
      db.prepare("UPDATE loans SET balance=balance-?,status=CASE WHEN balance-?<=0 THEN 'closed' ELSE status END WHERE id=?").bind(amount,amount,loanId)
    ]);  } else if(action==='update_loan'){
    await db.prepare("UPDATE loans SET interest_rate=?,next_due_date=?,remarks=? WHERE id=?").bind(Number(body.interest_rate),String(body.next_due_date),String(body.remarks||''),String(body.id)).run();
  } else if(action==='update_collection'){
    const id=String(body.id);const amount=Number(String(body.amount).replace(/[^0-9.]/g,''));
    const existing=await db.prepare("SELECT amount,loan_id FROM collections WHERE id=?").bind(id).first<{amount:number;loan_id:string}>();
    if(!existing||!Number.isFinite(amount)||amount<=0) return Response.json({error:'Valid receipt and amount are required'},{status:400});
    const loan=await db.prepare("SELECT balance FROM loans WHERE id=?").bind(existing.loan_id).first<{balance:number}>();
    const adjustedBalance=(loan?.balance||0)+existing.amount-amount;
    if(adjustedBalance<0) return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});
    await db.batch([
      db.prepare("UPDATE collections SET amount=?,method=?,remarks=? WHERE id=?").bind(amount,String(body.method),String(body.remarks||''),id),
      db.prepare("UPDATE loans SET balance=?,status=CASE WHEN ?<=0 THEN 'closed' WHEN status='closed' THEN 'active' ELSE status END WHERE id=?").bind(adjustedBalance,adjustedBalance,existing.loan_id)
    ]);
  } else if(action==='delete_agent'){
    const id=String(body.id||'');
    const agent=await db.prepare("SELECT id FROM users WHERE id=? AND role='agent'").bind(id).first();
    if(!agent) return Response.json({error:'Active agent not found'},{status:404});
    await db.batch([
      db.prepare("UPDATE users SET assigned_agent_id=NULL WHERE assigned_agent_id=?").bind(id),
      db.prepare("UPDATE users SET role='archived_agent' WHERE id=? AND role='agent'").bind(id)
    ]);  } else if(action==='create_agent'){
    await db.prepare("INSERT INTO users (id,name,phone,email,role,created_at) VALUES (?,?,?,?,?,?)").bind('agent-'+crypto.randomUUID(),String(body.name),String(body.phone),String(body.email||''),'agent',now).run();
  } else if(action==='update_agent'){
    await db.prepare("UPDATE users SET name=?,phone=?,email=? WHERE id=? AND role='agent'").bind(String(body.name),String(body.phone),String(body.email||''),String(body.id)).run();
  } else return Response.json({error:'Unknown action'},{status:400});
  return Response.json({ok:true});
}