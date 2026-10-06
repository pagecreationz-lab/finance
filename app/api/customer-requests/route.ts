import {access,requirePermission} from '@/lib/rbac';
import {AuthError} from '@/lib/auth';
import {hasSupabaseConfig,getSupabaseAdmin} from '@/lib/supabase-admin';
import {readLocalStore,mutateLocalStore} from '@/lib/local-data-store';
import {customerInput,mutateCustomerRequest,requestSummary,type CustomerRequest} from '@/lib/customer-requests';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Customer request failed'},{status:e instanceof AuthError?e.status:400});
async function authorize(request:Request){
 if(!hasSupabaseConfig()&&process.env.NODE_ENV==='production'&&!['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname))throw new Error('Production database is not configured');
 const {session,permissions}=await access(request);if(!['agent','manager','admin'].includes(session.role))throw new AuthError('Access denied',403);
 requirePermission(permissions,'customers');requirePermission(permissions,session.role==='agent'?'submit_customer':'approve_customer');return session;
}
export async function GET(request:Request){try{
 const session=await authorize(request);const page=Math.max(0,Number(new URL(request.url).searchParams.get('page'))||0);if(!Number.isSafeInteger(page))throw new Error('Invalid page');
 let rows:CustomerRequest[];
 if(!hasSupabaseConfig())rows=((await readLocalStore()).customer_requests||[]).filter(r=>session.role!=='agent'||r.agent_id===session.id).sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)).slice(page*50,page*50+51);
 else{let query=getSupabaseAdmin().from('customer_requests').select(session.role==='agent'?'id,status,created_at,reviewed_at':'*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50);if(session.role==='agent')query=query.eq('agent_id',session.id);const r=await query;if(r.error)throw new Error('Customer approvals database unavailable. Apply the customer approval migration.');rows=r.data as unknown as CustomerRequest[];}
 return Response.json({requests:rows.slice(0,50).map(r=>session.role==='agent'?requestSummary(r):r),hasMore:rows.length>50},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const session=await authorize(request),origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError('Invalid origin',403);
 const body=await request.json();if(!['submit','approve','reject'].includes(body.action)||typeof body.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))throw new Error('Invalid customer request');
 if((body.action==='submit'&&session.role!=='agent')||(body.action!=='submit'&&session.role==='agent'))throw new AuthError('Action not permitted for this role',403);
 const payload:Record<string,unknown>=body.action==='submit'?{action:body.action,id:body.id,...customerInput(body)}:{action:body.action,id:body.id,reason:String(body.reason||'').trim()};
 if(body.action!=='submit'&&String(payload.reason).length>1000)throw new Error('Review reason must be at most 1,000 characters');
 let result:CustomerRequest;
 if(!hasSupabaseConfig())result=await mutateLocalStore(data=>mutateCustomerRequest(data,payload,session));
 else{const r=await getSupabaseAdmin().rpc('rmv_customer_request',{p_body:payload,p_actor:session.id,p_name:session.name,p_role:session.role});if(r.error)throw new Error(r.error.message);result=r.data;}
 return Response.json({ok:true,request:session.role==='agent'?requestSummary(result):result});
 }catch(e){return fail(e)}}
