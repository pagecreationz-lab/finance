import { requireAdmin,requireSession } from '@/lib/auth';
import { readLocalStore } from '@/lib/local-data-store';
import { hasSupabaseConfig,getSupabaseAdmin } from '@/lib/supabase-admin';
export async function GET(request:Request){
  try{
    requireAdmin(requireSession(request));
    const url=new URL(request.url),offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
    let rows;
    if(!hasSupabaseConfig()&&['localhost','127.0.0.1','::1'].includes(url.hostname)){
      rows=(await readLocalStore()).audit_logs.slice().sort((a,b)=>b.created_at-a.created_at).slice(offset,offset+101);
    }else{
      const result=await getSupabaseAdmin().from('audit_logs').select('*').order('created_at',{ascending:false}).order('id').range(offset,offset+100);
      if(result.error)throw new Error(result.error.message);rows=result.data;
    }
    return Response.json({logs:rows.slice(0,100),hasMore:rows.length>100},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;
    return Response.json({error:error instanceof Error?error.message:'Could not load logs'},{status});
  }
}