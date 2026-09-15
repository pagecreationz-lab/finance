import { getSupabaseAdmin, hasSupabaseConfig } from '@/lib/supabase-admin';
import { AuthError, hashPassword, requireAdmin, requireSession, type AppSession } from '@/lib/auth';
import { mutateLocalStore, readLocalStore, type LocalFinanceData, type StoredAuditLog, type StoredCollection, type StoredLoan, type StoredUser } from '@/lib/local-data-store';
import { createAuditLog, type AuditAction } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DbError = { message:string } | null;
class ApiError extends Error { constructor(message:string, public status=400){super(message)} }
const n=(value:unknown)=>Number(value)||0;
const ok=(error:DbError)=>{if(error)throw new Error(error.message)};
const hasSupabase=hasSupabaseConfig;
const isLocalRequest=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);
const useLocalStore=(request:Request)=>!hasSupabase()&&(process.env.NODE_ENV!=='production'||isLocalRequest(request));
const fail=(error:unknown)=>{
  const message=error instanceof Error?error.message:'Database request failed';
  const status=error instanceof AuthError?error.status:error instanceof ApiError?error.status:message.startsWith('Supabase is not configured')?503:500;
  return Response.json({error:message},{status});
};

function snapshot(users:StoredUser[], loanRows:StoredLoan[], collectionRows:StoredCollection[], auditRows:StoredAuditLog[] = []) {
  const userById=new Map(users.map(user=>[user.id,user])),loanById=new Map(loanRows.map(loan=>[loan.id,loan]));
  const customers=users.filter(user=>user.role==='customer').map(user=>{
    const active=loanRows.filter(loan=>loan.customer_id===user.id&&!['closed','foreclosed'].includes(loan.status));
    return {id:user.id,name:user.name,phone:user.phone,email:user.email,username:user.username||'',assigned_agent_id:user.assigned_agent_id,agent_name:user.assigned_agent_id?userById.get(user.assigned_agent_id)?.name||null:null,active_loans:active.length,outstanding:active.reduce((sum,loan)=>sum+n(loan.balance),0),kyc:'Verified'};
  });
  const loans=loanRows.map(loan=>{
    const customer=userById.get(loan.customer_id);
    const receiptPaid=collectionRows.filter(item=>item.loan_id===loan.id).reduce((sum,item)=>sum+n(item.amount),0);
    return {...loan,customer_name:customer?.name||'Unknown customer',phone:customer?.phone||'',agent_name:customer?.assigned_agent_id?userById.get(customer.assigned_agent_id)?.name||null:null,paid:receiptPaid+(loan.status==='foreclosed'?n(loan.foreclosure_amount):0)};
  });
  const collections=collectionRows.map(item=>{
    const loan=loanById.get(item.loan_id),customer=loan?userById.get(loan.customer_id):undefined;
    return {...item,customer_name:customer?.name||'Unknown customer',agent_name:userById.get(item.agent_id)?.name||'Unknown agent',loan_balance:loan?.balance||0};
  });
  const agents=users.filter(user=>user.role==='agent').map(agent=>({id:agent.id,name:agent.name,phone:agent.phone,email:agent.email,username:agent.username||'',assigned:users.filter(user=>user.role==='customer'&&user.assigned_agent_id===agent.id).length,collected:collectionRows.filter(item=>item.agent_id===agent.id).reduce((sum,item)=>sum+n(item.amount),0)}));
  const summary={customer_count:customers.length,loan_count:loans.length,disbursed:loanRows.reduce((sum,loan)=>sum+n(loan.principal),0),outstanding:loanRows.filter(loan=>loan.status!=='closed').reduce((sum,loan)=>sum+n(loan.balance),0),collected:collectionRows.reduce((sum,item)=>sum+n(item.amount),0),agent_count:agents.length};
  return {customers,loans,collections,agents,summary,audit_logs:[...auditRows].sort((a,b)=>b.created_at-a.created_at)};
}

function scopeRows(data:LocalFinanceData,session:AppSession):LocalFinanceData{
  if(session.role==='admin')return data;
  if(session.role==='agent'){
    const customerIds=new Set(data.users.filter(user=>user.role==='customer'&&user.assigned_agent_id===session.id).map(user=>user.id));
    const loanIds=new Set(data.loans.filter(loan=>customerIds.has(loan.customer_id)).map(loan=>loan.id));
    return {users:data.users.filter(user=>user.id===session.id||customerIds.has(user.id)),loans:data.loans.filter(loan=>loanIds.has(loan.id)),collections:data.collections.filter(item=>loanIds.has(item.loan_id)),audit_logs:[]};
  }
  const customer=data.users.find(user=>user.id===session.id&&user.role==='customer');
  const loanIds=new Set(data.loans.filter(loan=>loan.customer_id===session.id).map(loan=>loan.id));
  return {users:data.users.filter(user=>user.id===session.id||user.id===customer?.assigned_agent_id),loans:data.loans.filter(loan=>loanIds.has(loan.id)),collections:data.collections.filter(item=>loanIds.has(item.loan_id)),audit_logs:[]};
}

async function localAction(body:Record<string,unknown>,session:AppSession) {
  const action=String(body.action||''),now=Math.floor(Date.now()/1000);
  await mutateLocalStore((data:LocalFinanceData)=>{
    if(action==='create_customer'){
      if(!String(body.name||'').trim()||!String(body.phone||'').trim())throw new ApiError('Name and mobile number are required');
      data.users.push({id:String(body._entity_id),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'').trim()||null,role:'customer',assigned_agent_id:String(body.agent_id||'')||null,created_at:now,username:null,password_hash:null});
    } else if(action==='update_customer'){
      const user=data.users.find(item=>item.id===String(body.id)&&item.role==='customer');if(!user)throw new ApiError('Customer not found',404);
      user.name=String(body.name||'').trim();user.phone=String(body.phone||'').trim();user.email=String(body.email||'').trim()||null;
    } else if(action==='delete_customers'){
      const ids=Array.isArray(body.ids)?body.ids.map(String):[];
      const blocked=new Set(data.loans.filter(loan=>ids.includes(loan.customer_id)&&(n(loan.balance)>0||!['closed','foreclosed'].includes(loan.status))).map(loan=>loan.customer_id));
      const targets=data.users.filter(user=>user.role==='customer'&&ids.includes(user.id));
      body.deleted_ids=targets.filter(user=>!blocked.has(user.id)).map(user=>user.id);
      body.blocked_ids=targets.filter(user=>blocked.has(user.id)).map(user=>user.id);
      targets.forEach(user=>{if(!blocked.has(user.id)){user.role='archived_customer';user.assigned_agent_id=null;}});
    } else if(action==='assign_customer'){
      const customer=data.users.find(item=>item.id===String(body.customer_id)&&item.role==='customer');if(!customer)throw new ApiError('Customer not found',404);
      const agentId=String(body.agent_id||'')||null;
      if(agentId&&!data.users.some(item=>item.id===agentId&&item.role==='agent'))throw new ApiError('Agent not found',404);
      customer.assigned_agent_id=agentId;
    } else if(action==='create_loan'){
      const principal=Number(body.principal),customerId=String(body.customer_id||'');
      if(!customerId||!Number.isFinite(principal)||principal<=0)throw new ApiError('Customer and valid principal are required');
      if(!data.users.some(item=>item.id===customerId&&item.role==='customer'))throw new ApiError('Customer not found',404);
      data.loans.push({id:String(body._entity_id),customer_id:customerId,principal,balance:principal,interest_type:String(body.interest_type||'fixed'),interest_rate:Number(body.interest_rate||0),repayment_frequency:String(body.repayment_frequency||'monthly'),given_date:String(body.given_date),next_due_date:String(body.next_due_date),security_type:String(body.security_type||'asset'),security_file_key:String(body.security_file_key||'')||null,remarks:String(body.remarks||'')||null,status:'active'});
    } else if(action==='create_collection'){
      const amount=Number(body.amount),loanId=String(body.loan_id||''),loan=data.loans.find(item=>item.id===loanId);
      if(!loanId||!Number.isFinite(amount)||amount<=0)throw new ApiError('Loan and valid collection amount are required');
      if(!loan)throw new ApiError('Loan not found',404);if(session.role==='agent'&&!data.users.some(user=>user.id===loan.customer_id&&user.assigned_agent_id===session.id))throw new AuthError('This customer is not assigned to you',403);
      if(amount>n(loan.balance))throw new ApiError('Collection cannot exceed the outstanding balance');
      data.collections.unshift({id:String(body._entity_id),loan_id:loanId,agent_id:session.role==='agent'?session.id:String(body.agent_id||'agent-deepak'),amount,method:String(body.method||'Cash'),proof_file_key:String(body.proof_file_key||'')||null,remarks:String(body.remarks||'')||null,collected_at:now});
      loan.balance=n(loan.balance)-amount;if(loan.balance<=0)loan.status='closed';
    } else if(action==='foreclose_loan'){
      const loan=data.loans.find(item=>item.id===String(body.id));if(!loan)throw new ApiError('Loan not found',404);if(loan.status==='closed'||loan.status==='foreclosed')throw new ApiError('Only an open loan can be foreclosed');
      const originalBalance=n(loan.balance),amount=Number(body.amount),remarks=String(body.remarks||'').trim();if(!Number.isFinite(amount)||!Number.isInteger(amount)||amount<0||amount>originalBalance)throw new ApiError('Settlement amount must be a whole-rupee value between zero and the outstanding balance');if(!remarks)throw new ApiError('Foreclosure remarks are required');
      body.waived_amount=originalBalance-amount;body.original_balance=originalBalance;loan.foreclosed_at=now;loan.foreclosure_amount=amount;loan.foreclosure_waived=originalBalance-amount;loan.foreclosure_proof_file_key=String(body.proof_file_key||'')||null;loan.foreclosure_remarks=remarks;loan.foreclosed_by=session.name;loan.reopened_at=null;loan.reopen_reason=null;loan.reopened_by=null;loan.balance=0;loan.status='foreclosed';
    } else if(action==='reopen_loan'){
      const loan=data.loans.find(item=>item.id===String(body.id));if(!loan)throw new ApiError('Loan not found',404);if(loan.status!=='foreclosed')throw new ApiError('Only a foreclosed loan can be reopened');
      const reason=String(body.reason||'').trim();if(!reason)throw new ApiError('A reopen reason is required');const restored=n(loan.foreclosure_amount)+n(loan.foreclosure_waived);const customer=data.users.find(user=>user.id===loan.customer_id);if(customer?.role==='archived_customer')customer.role='customer';body.restored_balance=restored;body.previous_foreclosure={amount:loan.foreclosure_amount,waived:loan.foreclosure_waived,proof:loan.foreclosure_proof_file_key,remarks:loan.foreclosure_remarks,at:loan.foreclosed_at};loan.balance=restored;loan.status=loan.next_due_date<new Date().toISOString().slice(0,10)?'overdue':'active';loan.reopened_at=now;loan.reopen_reason=reason;loan.reopened_by=session.name;
    } else if(action==='update_loan'){
      const loan=data.loans.find(item=>item.id===String(body.id));if(!loan)throw new ApiError('Loan not found',404);if(session.role==='agent'&&!data.users.some(user=>user.id===loan.customer_id&&user.assigned_agent_id===session.id))throw new AuthError('This customer is not assigned to you',403);
      loan.interest_rate=Number(body.interest_rate);loan.next_due_date=String(body.next_due_date);loan.remarks=String(body.remarks||'')||null;
    } else if(action==='update_collection'){
      const id=String(body.id),amount=Number(String(body.amount).replace(/[^0-9.]/g,'')),receipt=data.collections.find(item=>item.id===id);
      if(!Number.isFinite(amount)||amount<=0)throw new ApiError('Valid receipt and amount are required');
      if(!receipt)throw new ApiError('Receipt not found',404);if(session.role==='agent'&&receipt.agent_id!==session.id)throw new AuthError('You can edit only your own collections',403);
      const loan=data.loans.find(item=>item.id===receipt.loan_id);if(!loan)throw new ApiError('Loan not found',404);if(session.role==='agent'&&!data.users.some(user=>user.id===loan.customer_id&&user.assigned_agent_id===session.id))throw new AuthError('This customer is not assigned to you',403);
      if(loan.status==='foreclosed')throw new ApiError('Reopen the loan before editing its collections');body.loan_id=receipt.loan_id;
      const balance=n(loan.balance)+n(receipt.amount)-amount;if(balance<0)throw new ApiError('Collection cannot exceed the outstanding balance');
      receipt.amount=amount;receipt.method=String(body.method||'Cash');receipt.remarks=String(body.remarks||'')||null;
      loan.balance=balance;loan.status=balance<=0?'closed':loan.status==='closed'?'active':loan.status;
    } else if(action==='delete_agent'){
      const agent=data.users.find(item=>item.id===String(body.id)&&item.role==='agent');if(!agent)throw new ApiError('Active agent not found',404);
      data.users.forEach(user=>{if(user.assigned_agent_id===agent.id)user.assigned_agent_id=null});agent.role='archived_agent';
    } else if(action==='create_agent'){
      const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
      if(!String(body.name||'').trim()||!String(body.phone||'').trim()||!username||password.length<8)throw new ApiError('Name, mobile, username and an 8-character password are required');
      if(data.users.some(user=>user.username?.toLowerCase()===username))throw new ApiError('Username is already in use');
      data.users.push({id:String(body._entity_id),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'').trim()||null,role:'agent',assigned_agent_id:null,created_at:now,username,password_hash:hashPassword(password)});
    } else if(action==='update_agent'){
      const agent=data.users.find(item=>item.id===String(body.id)&&item.role==='agent');if(!agent)throw new ApiError('Agent not found',404);
      agent.name=String(body.name||'').trim();agent.phone=String(body.phone||'').trim();agent.email=String(body.email||'').trim()||null;const username=String(body.username||'').trim().toLowerCase();if(username&&data.users.some(item=>item.id!==agent.id&&item.username?.toLowerCase()===username))throw new ApiError('Username is already in use');if(username)agent.username=username;if(String(body.password||''))agent.password_hash=hashPassword(String(body.password));
    } else throw new ApiError('Unknown action');
    data.users.forEach(user=>{if(user.role==='archived_customer'&&data.loans.some(loan=>loan.customer_id===user.id&&(n(loan.balance)>0||!['closed','foreclosed'].includes(loan.status))))user.role='customer';});
    data.audit_logs.unshift(createAuditLog(session,action as AuditAction,body,now));
  });
}

export async function GET(request:Request){
  try{
    const session=requireSession(request);
    if(useLocalStore(request)){const scoped=scopeRows(await readLocalStore(),session);return Response.json({...snapshot(scoped.users,scoped.loans,scoped.collections,scoped.audit_logs),session},{headers:{'Cache-Control':'no-store','X-FundFlow-Storage':'local-file'}})}
    const db=getSupabaseAdmin();
    const [ur,lr,cr]=await Promise.all([db.from('users').select('*').order('created_at',{ascending:true}),db.from('loans').select('*').order('given_date',{ascending:false}),db.from('collections').select('*').order('collected_at',{ascending:false})]);
    ok(ur.error);ok(lr.error);ok(cr.error);
    const ar=session.role==='admin'?await db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(2000):{data:[],error:null};ok(ar.error);
    const scoped=scopeRows({users:(ur.data||[]) as StoredUser[],loans:(lr.data||[]) as StoredLoan[],collections:(cr.data||[]) as StoredCollection[],audit_logs:(ar.data||[]) as StoredAuditLog[]},session);
    return Response.json({...snapshot(scoped.users,scoped.loans,scoped.collections,scoped.audit_logs),session},{headers:{'Cache-Control':'no-store','X-FundFlow-Storage':'supabase'}});
  }catch(error){return fail(error)}
}

export async function POST(request:Request){
  try{
    const session=requireSession(request),body=await request.json() as Record<string,unknown>,action=String(body.action||'');
    if(action==='create_customer')body._entity_id='customer-'+crypto.randomUUID();else if(action==='create_loan')body._entity_id='LN-'+crypto.randomUUID().slice(0,8).toUpperCase();else if(action==='create_collection')body._entity_id='RC-'+crypto.randomUUID().slice(0,8).toUpperCase();else if(action==='create_agent')body._entity_id='agent-'+crypto.randomUUID();
    const adminActions=new Set(['create_customer','update_customer','delete_customers','assign_customer','create_loan','update_loan','foreclose_loan','reopen_loan','delete_agent','create_agent','update_agent']);
    if(adminActions.has(action))requireAdmin(session);
    if(!adminActions.has(action)&&!['create_collection','update_collection'].includes(action))throw new AuthError('This role cannot perform that action',403);
    if(session.role==='customer')throw new AuthError('Customer accounts are read-only',403);
    if(useLocalStore(request)){await localAction(body,session);return Response.json({ok:true,storage:'local-file',deleted_ids:body.deleted_ids,blocked_ids:body.blocked_ids})}
    const db=getSupabaseAdmin(),now=Math.floor(Date.now()/1000);
    if(action==='delete_customers'){
      const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(String))]:[];
      const result=await db.rpc('fundflow_delete_customers',{p_ids:ids,p_event:createAuditLog(session,'delete_customers',body,now)});
      if(result.error)throw new ApiError(result.error.message);
      return Response.json({ok:true,...result.data,storage:'supabase'});
    }
    if(action==='foreclose_loan'||action==='reopen_loan'){
      const record=createAuditLog(session,action,body,now);
      const result=await db.rpc('fundflow_loan_transition',{p_action:action,p_loan_id:String(body.id||''),p_amount:action==='foreclose_loan'?Number(body.amount):null,p_reason:String(action==='reopen_loan'?body.reason||'':body.remarks||'').trim(),p_proof:String(body.proof_file_key||'')||null,p_event:record});
      if(result.error)throw new ApiError(result.error.message);
      return Response.json({ok:true,storage:'supabase'});
    }
    if(action==='create_customer'){if(!String(body.name||'').trim()||!String(body.phone||'').trim())throw new ApiError('Name and mobile number are required');const r=await db.from('users').insert({id:String(body._entity_id),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'')||null,role:'customer',assigned_agent_id:String(body.agent_id||'')||null,created_at:now,username:null,password_hash:null});ok(r.error)}
    else if(action==='update_customer'){const changes:Record<string,unknown>={name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null};const r=await db.from('users').update(changes).eq('id',String(body.id)).eq('role','customer');ok(r.error)}
    else if(action==='assign_customer'){const r=await db.from('users').update({assigned_agent_id:String(body.agent_id||'')||null}).eq('id',String(body.customer_id)).eq('role','customer');ok(r.error)}
    else if(action==='create_loan'){const principal=Number(body.principal);if(!String(body.customer_id||'')||!Number.isFinite(principal)||principal<=0)return Response.json({error:'Customer and valid principal are required'},{status:400});const r=await db.from('loans').insert({id:String(body._entity_id),customer_id:String(body.customer_id),principal,balance:principal,interest_type:String(body.interest_type||'fixed'),interest_rate:Number(body.interest_rate||0),repayment_frequency:String(body.repayment_frequency||'monthly'),given_date:String(body.given_date),next_due_date:String(body.next_due_date),security_type:String(body.security_type||'asset'),security_file_key:String(body.security_file_key||'')||null,remarks:String(body.remarks||'')||null,status:'active'});ok(r.error)}
    else if(action==='create_collection'){const amount=Number(body.amount),loanId=String(body.loan_id||'');if(!loanId||!Number.isFinite(amount)||amount<=0)return Response.json({error:'Loan and valid collection amount are required'},{status:400});const loan=await db.from('loans').select('balance,status').eq('id',loanId).single();ok(loan.error);if(!loan.data)return Response.json({error:'Loan not found'},{status:404});if(session.role==='agent'){const owner=await db.from('users').select('assigned_agent_id').eq('id',String((await db.from('loans').select('customer_id').eq('id',loanId).single()).data?.customer_id||'')).single();ok(owner.error);if(owner.data?.assigned_agent_id!==session.id)throw new AuthError('This customer is not assigned to you',403)}if(amount>n(loan.data.balance))return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});const receipt=await db.from('collections').insert({id:String(body._entity_id),loan_id:loanId,agent_id:session.role==='agent'?session.id:String(body.agent_id||'agent-deepak'),amount,method:String(body.method||'Cash'),proof_file_key:String(body.proof_file_key||'')||null,remarks:String(body.remarks||'')||null,collected_at:now});ok(receipt.error);const balance=n(loan.data.balance)-amount,update=await db.from('loans').update({balance,status:balance<=0?'closed':loan.data.status}).eq('id',loanId);ok(update.error)}
    else if(action==='foreclose_loan'){const id=String(body.id||''),loan=await db.from('loans').select('balance,status').eq('id',id).single();ok(loan.error);if(!loan.data)throw new ApiError('Loan not found',404);if(loan.data.status==='closed'||loan.data.status==='foreclosed')throw new ApiError('Only an open loan can be foreclosed');const originalBalance=n(loan.data.balance),amount=Number(body.amount),remarks=String(body.remarks||'').trim();if(!Number.isFinite(amount)||!Number.isInteger(amount)||amount<0||amount>originalBalance)throw new ApiError('Settlement amount must be a whole-rupee value between zero and the outstanding balance');if(!remarks)throw new ApiError('Foreclosure remarks are required');const result=await db.from('loans').update({balance:0,status:'foreclosed',foreclosed_at:now,foreclosure_amount:amount,foreclosure_waived:originalBalance-amount,foreclosure_proof_file_key:String(body.proof_file_key||'')||null,foreclosure_remarks:remarks,foreclosed_by:session.name,reopened_at:null,reopen_reason:null,reopened_by:null}).eq('id',id);ok(result.error)}
    else if(action==='reopen_loan'){const id=String(body.id||''),loan=await db.from('loans').select('status,foreclosure_amount,foreclosure_waived,next_due_date').eq('id',id).single();ok(loan.error);if(!loan.data)throw new ApiError('Loan not found',404);if(loan.data.status!=='foreclosed')throw new ApiError('Only a foreclosed loan can be reopened');const reason=String(body.reason||'').trim();if(!reason)throw new ApiError('A reopen reason is required');const restored=n(loan.data.foreclosure_amount)+n(loan.data.foreclosure_waived);body.restored_balance=restored;const status=String(loan.data.next_due_date)<new Date().toISOString().slice(0,10)?'overdue':'active';const result=await db.from('loans').update({balance:restored,status,reopened_at:now,reopen_reason:reason,reopened_by:session.name}).eq('id',id);ok(result.error)}
    else if(action==='update_loan'){const r=await db.from('loans').update({interest_rate:Number(body.interest_rate),next_due_date:String(body.next_due_date),remarks:String(body.remarks||'')||null}).eq('id',String(body.id));ok(r.error)}
    else if(action==='update_collection'){const id=String(body.id),amount=Number(String(body.amount).replace(/[^0-9.]/g,''));if(!Number.isFinite(amount)||amount<=0)return Response.json({error:'Valid receipt and amount are required'},{status:400});const existing=await db.from('collections').select('amount,loan_id,agent_id').eq('id',id).single();ok(existing.error);if(!existing.data)return Response.json({error:'Receipt not found'},{status:404});if(session.role==='agent'&&existing.data.agent_id!==session.id)throw new AuthError('You can edit only your own collections',403);const loan=await db.from('loans').select('balance,status').eq('id',existing.data.loan_id).single();ok(loan.error);if(!loan.data)return Response.json({error:'Loan not found'},{status:404});if(loan.data.status==='foreclosed')throw new ApiError('Reopen the loan before editing its collections');body.loan_id=existing.data.loan_id;const balance=n(loan.data.balance)+n(existing.data.amount)-amount;if(balance<0)return Response.json({error:'Collection cannot exceed the outstanding balance'},{status:400});const receipt=await db.from('collections').update({amount,method:String(body.method||'Cash'),remarks:String(body.remarks||'')||null}).eq('id',id);ok(receipt.error);const status=balance<=0?'closed':loan.data.status==='closed'?'active':loan.data.status,update=await db.from('loans').update({balance,status}).eq('id',existing.data.loan_id);ok(update.error)}
    else if(action==='delete_agent'){const id=String(body.id||''),agent=await db.from('users').select('id').eq('id',id).eq('role','agent').maybeSingle();ok(agent.error);if(!agent.data)return Response.json({error:'Active agent not found'},{status:404});const unassign=await db.from('users').update({assigned_agent_id:null}).eq('assigned_agent_id',id);ok(unassign.error);const archive=await db.from('users').update({role:'archived_agent'}).eq('id',id).eq('role','agent');ok(archive.error)}
    else if(action==='create_agent'){const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(!username||password.length<8)throw new ApiError('Username and an 8-character password are required');const r=await db.from('users').insert({id:String(body._entity_id),name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null,role:'agent',created_at:now,username,password_hash:hashPassword(password)});ok(r.error)}
    else if(action==='update_agent'){const changes:Record<string,unknown>={name:String(body.name||''),phone:String(body.phone||''),email:String(body.email||'')||null};if(String(body.username||''))changes.username=String(body.username).trim().toLowerCase();if(String(body.password||''))changes.password_hash=hashPassword(String(body.password));const r=await db.from('users').update(changes).eq('id',String(body.id)).eq('role','agent');ok(r.error)}
    else return Response.json({error:'Unknown action'},{status:400});
    const audit=await db.from('audit_logs').insert(createAuditLog(session,action as AuditAction,body,now));ok(audit.error);
    return Response.json({ok:true,storage:'supabase'});
  }catch(error){return fail(error)}
}




