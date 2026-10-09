import {access} from '@/lib/rbac';
import {AuthError,requireAdmin} from '@/lib/auth';
import {loanNumber} from '@/lib/loan-number';
import {hasSupabaseConfig,getSupabaseAdmin} from '@/lib/supabase-admin';
import {mutateLocalStore} from '@/lib/local-data-store';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const {session}=await access(request);requireAdmin(session);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError('Invalid origin',403);
 const body=await request.json(),id=String(body.id||''),number=loanNumber(body.loan_number);
 const event={id:'LOG-'+crypto.randomUUID(),actor_id:session.id,actor_name:session.name,actor_role:session.role,action:'update_loan',entity_type:'loan',entity_id:id,summary:'Changed loan number',metadata:{loan_number:number},created_at:Math.floor(Date.now()/1000)};
 if(hasSupabaseConfig()){
  const r=await getSupabaseAdmin().rpc('rmv_rename_loan_number',{p_id:id,p_number:number,p_event:event});if(r.error)throw new Error(r.error.message);
 }else{
  if(process.env.NODE_ENV==='production'&&!['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname))throw new Error('Production database is not configured');
  await mutateLocalStore(data=>{
   const loan=data.loans.find(l=>l.id===id);if(!loan)throw new Error('Loan not found');
   if(data.loans.some(l=>l.id!==id&&(l.id.toUpperCase()===number||(l.loan_number||l.id).toUpperCase()===number))||data.loan_requests?.some(r=>r.status==='pending'&&r.loan_number===number))throw new Error('Loan number already in use or awaiting approval');
   const previous=loan.loan_number||loan.id;loan.loan_number=number;
   data.audit_logs.unshift({...event,metadata:{previous_loan_number:previous,loan_number:number}});
  });
 }
 return Response.json({ok:true,loan_number:number});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Loan number update failed'},{status:e instanceof AuthError?e.status:400})}}
