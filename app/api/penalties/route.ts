import {access,requirePermission} from '@/lib/rbac';
import {AuthError} from '@/lib/auth';
import {hasSupabaseConfig,getSupabaseAdmin} from '@/lib/supabase-admin';
import {readLocalStore,mutateLocalStore} from '@/lib/local-data-store';
import {requestPenalty,penaltyInput} from '@/lib/penalties';
export const dynamic='force-dynamic';
async function authorize(request:Request){
 if(!hasSupabaseConfig()&&process.env.NODE_ENV==='production'&&!['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname))throw new Error('Production database is not configured.');
 const a=await access(request);if(!['admin','manager','agent'].includes(a.session.role))throw new AuthError('Forbidden',403);
 requirePermission(a.permissions,'collections');requirePermission(a.permissions,'loans');return a;
}
const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Penalty request failed'},{status:e instanceof AuthError?e.status:400});
export async function GET(request:Request){try{
 const {session}=await authorize(request);let requests;
 if(!hasSupabaseConfig())requests=(await readLocalStore()).penalty_requests||[];
 else{let q=getSupabaseAdmin().from('penalty_requests').select('*').order('created_at',{ascending:false});if(session.role==='agent')q=q.eq('requested_by',session.id);const r=await q;if(r.error)throw new Error('Apply the agent penalty approval migration before using penalties.');requests=r.data;}
 return Response.json({requests:requests.filter(r=>session.role!=='agent'||r.requested_by===session.id)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const {session,permissions}=await authorize(request),origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError('Invalid origin',403);
 const body=await request.json();if(!['request','approve','reject'].includes(body.action))throw new Error('Invalid action');
 if(body.action==='request'){if(session.role!=='agent')throw new AuthError('Only agents enter penalties.',403);requirePermission(permissions,'create_collection');Object.assign(body,penaltyInput(body));}
 else if(!['admin','manager'].includes(session.role))throw new AuthError('Admin Manager or Super Admin approval required.',403);
 if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new Error('Invalid request ID');
 let result;if(!hasSupabaseConfig())result=await mutateLocalStore(data=>requestPenalty(data,body,session));
 else{const r=await getSupabaseAdmin().rpc('rmv_penalty_request',{p_body:body,p_actor:session.id,p_name:session.name,p_role:session.role});if(r.error)throw new Error(r.error.message);result=r.data;}
 return Response.json({ok:true,request:result});
 }catch(e){return fail(e)}}
