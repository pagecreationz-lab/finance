import {access,requirePermission} from '@/lib/rbac';
import {AuthError} from '@/lib/auth';
import {readLocalStore,mutateLocalStore} from '@/lib/local-data-store';
import {hasSupabaseConfig,getSupabaseAdmin} from '@/lib/supabase-admin';
import {correctLocal,correctionReason} from '@/lib/receipt-corrections';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Correction failed'},{status:e instanceof AuthError?e.status:e instanceof Error&&e.message==='Production database is not configured.'?503:400});
async function authorize(request:Request){if(!hasSupabaseConfig()&&process.env.NODE_ENV==='production'&&!['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname))throw new Error('Production database is not configured.');const result=await access(request);if(!['admin','manager'].includes(result.session.role))throw new AuthError('Only administrators can access receipt corrections.',403);requirePermission(result.permissions,'collections');if(result.session.role==='manager')requirePermission(result.permissions,'request_correction');return result.session}
export async function GET(request:Request){try{
 const session=await authorize(request);let requests;
 if(!hasSupabaseConfig())requests=(await readLocalStore()).receipt_corrections||[];
 else{let query=getSupabaseAdmin().from('receipt_corrections').select('*').order('created_at',{ascending:false}).limit(500);if(session.role==='manager')query=query.eq('requested_by',session.id);const r=await query;if(r.error)throw new Error('Apply the receipt-corrections migration before using approvals.');requests=r.data}
 return Response.json({requests:requests.filter(r=>session.role==='admin'||r.requested_by===session.id).slice(0,500)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const session=await authorize(request),origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError('Invalid origin',403);
 const body=await request.json();if(!['request','approve','reject'].includes(body.action))throw new Error('Invalid correction action');
 if(body.action!=='request'&&session.role!=='admin')throw new AuthError('Super admin approval is required.',403);
 if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new Error('Invalid request ID');
 body.reason=correctionReason(body.reason);
 if(body.action==='request'&&(!Number.isSafeInteger(body.amount)||body.amount<0||!Number.isSafeInteger(body.before_amount)))throw new Error('Enter a valid whole-rupee amount.');
 let result;
 if(!hasSupabaseConfig())result=await mutateLocalStore(data=>correctLocal(data,body,session));
 else{const r=await getSupabaseAdmin().rpc('rmv_correct_receipt',{p_body:body,p_actor:session.id,p_name:session.name,p_role:session.role});if(r.error)throw new Error(r.error.message);result=r.data}
 return Response.json({ok:true,request:result});
}catch(e){return fail(e)}}
