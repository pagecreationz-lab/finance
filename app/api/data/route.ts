import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedRequest, unauthorizedResponse } from '@/lib/authorization';
import { mutateLocalStore, readLocalStore, type LocalFinanceData, type StoredCollection, type StoredLoan, type StoredUser } from '@/lib/local-data-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DbError = { message:string } | null;
class ApiError extends Error { constructor(message:string, public status=400){super(message)} }
const n=(value:unknown)=>Number(value)||0;
const ok=(error:DbError)=>{if(error)throw new Error(error.message)};
const hasSupabase=()=>Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
const isLocalRequest=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);
const useLocalStore=(request:Request)=>!hasSupabase()&&(process.env.NODE_ENV!=='production'||isLocalRequest(request));
const fail=(error:unknown)=>{
  const message=error instanceof Error?error.message:'Database request failed';
  const status=error instanceof ApiError?error.status:message.startsWith('Supabase is not configured')?503:500;
  return Response.json({error:message},{status});
};

function snapshot(users:StoredUser[], loanRows:StoredLoan[], collectionRows:StoredCollection[]) {
  const userById=new Map(users.map(user=>[user.id,user])),loanById=new Map(loanRows.map(loan=>[loan.id,loan]));
  const customers=users.filter(user=>user.role==='customer').map(user=>{
    const active=loanRows.filter(loan=>loan.customer_id===user.id&&loan.status!=='closed');
    return {id:user.id,name:user.name,phone:user.phone,email:user.email,assigned_agent_id:user.assigned_agent_id,agent_name:user.assigned_agent_id?userById.get(user.assigned_agent_id)?.name||null:null,active_loans:active.length,outstanding:active.reduce((sum,loan)=>sum+n(loan.balance),0),kyc:'Verified'};
  });
  const loans=loanRows.map(loan=>{
    const customer=userById.get(loan.customer_id);
    return {...loan,customer_name:customer?.name||'Unknown customer',phone:customer?.phone||'',agent_name:customer?.assigned_agent_id?userById.get(customer.assigned_agent_id)?.name||null:null,paid:collectionRows.filter(item=>item.loan_id===loan.id).reduce((sum,item)=>sum+n(item.amount),0)};
  });
  const collections=collectionRows.map(item=>{
    const loan=loanById.get(item.loan_id),customer=loan?userById.get(loan.customer_id):undefined;
    return {...item,customer_name:customer?.name||'Unknown customer',agent_name:userById.get(item.agent_id)?.name||'Unknown agent',loan_balance:loan?.balance||0};
  });
  const agents=users.filter(user=>user.role==='agent').map(agent=>({id:agent.id,name:agent.name,phone:agent.phone,email:agent.email,assigned:users.filter(user=>user.role==='customer'&&user.assigned_agent_id===agent.id).length,collected:collectionRows.filter(item=>item.agent_id===agent.id).reduce((sum,item)=>sum+n(item.amount),0)}));
  const summary={customer_count:customers.length,loan_count:loans.length,disbursed:loanRows.reduce((sum,loan)=>sum+n(loan.principal),0),outstanding:loanRows.filter(loan=>loan.status!=='closed').reduce((sum,loan)=>sum+n(loan.balance),0),collected:collectionRows.reduce((sum,item)=>sum+n(item.amount),0),agent_count:agents.length};
  return {customers,loans,collections,agents,summary};
}

async function localAction(body:Record<string,unknown>) {
  const action=String(body.action||''),now=Math.floor(Date.now()/1000);
  await mutateLocalStore((data:LocalFinanceData)=>{
    if(action==='create_customer'){
      if(!String(body.name||'').trim()||!String(body.phone||'').trim())throw new ApiError('Customer name and mobile number are required');
      data.users.push({id:'customer-'+crypto.randomUUID(),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'').trim()||null,role:'customer',assigned_agent_id:String(body.agent_id||'')||null,created_at:now});
    } else if(action==='update_customer'){
      const user=data.users.find(item=>item.id===String(body.id)&&item.role==='customer');if(!user)throw new ApiError('Customer not found',404);
      user.name=String(body.name||'').trim();user.phone=String(body.phone||'').trim();user.email=String(body.email||'').trim()||null;
    } else if(action==='delete_customers'){
      const ids=Array.isArray(body.ids)?body.ids.map(String):[];
      const blocked=new Set(data.loans.filter(loan=>ids.includes(loan.customer_id)).map(loan=>loan.customer_id));
      data.users=data.users.filter(user=>user.role!=='customer'||!ids.includes(user.id)||blocked.has(user.id));
    } else if(action==='assign_customer'){
      const customer=data.users.find(item=>item.id===String(body.customer_id)&&item.role==='customer');if(!customer)throw new ApiError('Customer not found',404);
      const agentId=String(body.agent_id||'')||null;
      if(agentId&&!data.users.some(item=>item.id===agentId&&item.role==='agent'))throw new ApiError('Agent not found',404);
      customer.assigned_agent_id=agentId;
    } else if(action==='create_loan'){
      const principal=Number(body.principal),customerId=String(body.customer_id||'');
      if(!customerId||!Number.isFinite(principal)||principal<=0)throw new ApiError('Customer and valid principal are required');
      if(!data.users.some(item=>item.id===customerId&&item.role==='customer'))throw new ApiError('Customer not found',404);
      data.loans.push({id:'LN-'+crypto.randomUUID().slice(0,8).toUpperCase(),customer_id:customerId,principal,balance:principal,interest_type:String(body.interest_type||'fixed'),interest_rate:Number(body.interest_rate||0),repayment_frequency:String(body.repayment_frequency||'monthly'),given_date:String(body.given_date),next_due_date:String(body.next_due_date),security_type:String(body.security_type||'asset'),security_file_key:String(body.security_file_key||'')||null,remarks:String(body.remarks||'')||null,status:'active'});
    } else if(action==='create_collection'){
      const amount=Number(body.amount),loanId=String(body.loan_id||''),loan=data.loans.find(item=>item.id===loanId);
      if(!loanId||!Number.isFinite(amount)||amount<=0)throw new ApiError('Loan and valid collection amount are required');
      if(!loan)throw new ApiError('Loan not found',404);
      if(amount>n(loan.balance))throw new ApiError('Collection cannot exceed the outstanding balance');
      data.collections.unshift({id:'RC-'+crypto.randomUUID().slice(0,8).toUpperCase(),loan_id:loanId,agent_id:String(body.agent_id||'agent-deepak'),amount,method:String(body.method||'Cash'),proof_file_key:String(body.proof_file_key||'')||null,remarks:String(body.remarks||'')||null,collected_at:now});
      loan.balance=n(loan.balance)-amount;if(loan.balance<=0)loan.status='closed';
    } else if(action==='update_loan'){
      const loan=data.loans.find(item=>item.id===String(body.id));if(!loan)throw new ApiError('Loan not found',404);
      loan.interest_rate=Number(body.interest_rate);loan.next_due_date=String(body.next_due_date);loan.remarks=String(body.remarks||'')||null;
    } else if(action==='update_collection'){
      const id=String(body.id),amount=Number(String(body.amount).replace(/[^0-9.]/g,'')),receipt=data.collections.find(item=>item.id===id);
      if(!Number.isFinite(amount)||amount<=0)throw new ApiError('Valid receipt and amount are required');
      if(!receipt)throw new ApiError('Receipt not found',404);
      const loan=data.loans.find(item=>item.id===receipt.loan_id);if(!loan)throw new ApiError('Loan not found',404);
      const balance=n(loan.balance)+n(receipt.amount)-amount;if(balance<0)throw new ApiError('Collection cannot exceed the outstanding balance');
      receipt.amount=amount;receipt.method=String(body.method||'Cash');receipt.remarks=String(body.remarks||'')||null;
      loan.balance=balance;loan.status=balance<=0?'closed':loan.status==='closed'?'active':loan.status;
    } else if(action==='delete_agent'){
      const agent=data.users.find(item=>item.id===String(body.id)&&item.role==='agent');if(!agent)throw new ApiError('Active agent not found',404);
      data.users.forEach(user=>{if(user.assigned_agent_id===agent.id)user.assigned_agent_id=null});agent.role='archived_agent';
    } else if(action==='create_agent'){
      if(!String(body.name||'').trim()||!String(body.phone||'').trim())throw new ApiError('Agent name and mobile number are required');
      data.users.push({id:'agent-'+crypto.randomUUID(),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'').trim()||null,role:'agent',assigned_agent_id:null,created_at:now});
    } else if(action==='update_agent'){
      const agent=data.users.find(item=>item.id===String(body.id)&&item.role==='agent');if(!agent)throw new ApiError('Agent not found',404);
      agent.name=String(body.name||'').trim();agent.phone=String(body.phone||'').trim();agent.email=String(body.email||'').trim()||null;
    } else throw new ApiError('Unknown action');
  });
}

export async function GET(request:Request){
  if(!isAuthorizedRequest(request))return unauthorizedResponse();
  try{
    if(useLocalStore(request)){const data=await readLocalStore();return Response.json(snapshot(data.users,data.loans,data.collections),{headers:{'Cache-Control':'no-store','X-FundFlow-Storage':'local-file'}})}
    const db=getSupabaseAdmin();
    const [ur,lr,cr]=await Promise.all([db.from('users').select('*').order('created_at',{ascending:true}),db.from('loans').select('*').order('given_date',{ascending:false}),db.from('collections').select('*').order('collected_at',{ascending:false})]);
    ok(ur.error);ok(lr.error);ok(cr.error);
    return Response.json(snapshot((ur.data||[]) as StoredUser[],(lr.data||[]) as StoredLoan[],(cr.data||[]) as StoredCollection[]),{headers:{'Cache-Control':'no-store','X-FundFlow-Storage':'supabase'}});
  }catch(error){return fail(error)}
}

export async function POST(request:Request){
  if(!isAuthorizedRequest(request))return unauthorizedResponse();
  try{
    const body=await request.json() as Record<string,unknown>;
    if(useLocalStore(request)){await localAction(body);return Response.json({ok:true,storage:'local-file'})}
    const db=getSupabaseAdmin(),action=String(body.action||''),now=Math.floor(Date.now()/1000);
    if(action==='create_customer'){const r=await db.from('users').insert({id:'customer-'+crypto.randomUUID(),name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null,role:'customer',assigned_agent_id:String(body.agent_id||'')||null,created_at:now});ok(r.error)}
    else if(action==='update_customer'){const r=await db.from('users').update({name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null}).eq('id',String(body.id)).eq('role','customer');ok(r.error)}
    else if(action==='delete_customers'){const ids=Array.isArray(body.ids)?body.ids.map(String):[];if(ids.length){const existing=await db.from('loans').select('customer_id').in('customer_id',ids);ok(existing.error);const blocked=new Set((existing.data||[]).map(row=>row.customer_id)),deletable=ids.filter(id=>!blocked.has(id));if(deletable.length){const r=await db.from('users').delete().eq('role','customer').in('id',deletable);ok(r.error)}}}
    else if(action==='assign_customer'){const r=await db.from('users').update({assigned_agent_id:String(body.agent_id||'')||null}).eq('id',String(body.customer_id)).eq('role','customer');ok(r.error)}
    else if(action==='create_loan'){const principal=Number(body.principal);if(!String(body.customer_id||'')||!Number.isFinite(principal)||principal<=0)return Response.json({error:'Customer and valid principal are required'},{status:400});const r=await db.from('loans').insert({id:'LN-'+crypto.randomUUID().slice(0,8).toUpperCase(),customer_id:String(body.customer_id),principal,balance:principal,interest_type:String(body.interest_type||'fixed'),interest_rate:Number(body.interest_rate||0),repayment_frequency:String(body.repayment_frequency||'monthly'),given_date:String(body.given_date),next_due_date:String(body.next_due_date),security_type:String(body.security_type||'asset'),security_file_key:String(body.security_file_key||'')||null,remarks:String(body.remarks||'')||null,status:'active'});ok(r.error)}
    else if(action==='create_collection'){const amount=Number(body.amount),loanId=String(body.loan_id||'');if(!loanId||!Number.isFinite(amount)||amount<=0)return Response.json({error:'Loan and valid collection amount are required'},{status:400});const loan=await db.from('loans').select('balance,status').eq('id',loanId).single();ok(loan.error);if(!loan.data)return Response.json({error:'Loan not found'},{status:404});if(amount>n(loan.data.balance))return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});const receipt=await db.from('collections').insert({id:'RC-'+crypto.randomUUID().slice(0,8).toUpperCase(),loan_id:loanId,agent_id:String(body.agent_id||'agent-deepak'),amount,method:String(body.method||'Cash'),proof_file_key:String(body.proof_file_key||'')||null,remarks:String(body.remarks||'')||null,collected_at:now});ok(receipt.error);const balance=n(loan.data.balance)-amount,update=await db.from('loans').update({balance,status:balance<=0?'closed':loan.data.status}).eq('id',loanId);ok(update.error)}
    else if(action==='update_loan'){const r=await db.from('loans').update({interest_rate:Number(body.interest_rate),next_due_date:String(body.next_due_date),remarks:String(body.remarks||'')||null}).eq('id',String(body.id));ok(r.error)}
    else if(action==='update_collection'){const id=String(body.id),amount=Number(String(body.amount).replace(/[^0-9.]/g,''));if(!Number.isFinite(amount)||amount<=0)return Response.json({error:'Valid receipt and amount are required'},{status:400});const existing=await db.from('collections').select('amount,loan_id').eq('id',id).single();ok(existing.error);if(!existing.data)return Response.json({error:'Receipt not found'},{status:404});const loan=await db.from('loans').select('balance,status').eq('id',existing.data.loan_id).single();ok(loan.error);if(!loan.data)return Response.json({error:'Loan not found'},{status:404});const balance=n(loan.data.balance)+n(existing.data.amount)-amount;if(balance<0)return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});const receipt=await db.from('collections').update({amount,method:String(body.method||'Cash'),remarks:String(body.remarks||'')||null}).eq('id',id);ok(receipt.error);const status=balance<=0?'closed':loan.data.status==='closed'?'active':loan.data.status,update=await db.from('loans').update({balance,status}).eq('id',existing.data.loan_id);ok(update.error)}
    else if(action==='delete_agent'){const id=String(body.id||''),agent=await db.from('users').select('id').eq('id',id).eq('role','agent').maybeSingle();ok(agent.error);if(!agent.data)return Response.json({error:'Active agent not found'},{status:404});const unassign=await db.from('users').update({assigned_agent_id:null}).eq('assigned_agent_id',id);ok(unassign.error);const archive=await db.from('users').update({role:'archived_agent'}).eq('id',id).eq('role','agent');ok(archive.error)}
    else if(action==='create_agent'){const r=await db.from('users').insert({id:'agent-'+crypto.randomUUID(),name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null,role:'agent',created_at:now});ok(r.error)}
    else if(action==='update_agent'){const r=await db.from('users').update({name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null}).eq('id',String(body.id)).eq('role','agent');ok(r.error)}
    else return Response.json({error:'Unknown action'},{status:400});
    return Response.json({ok:true,storage:'supabase'});
  }catch(error){return fail(error)}
}

