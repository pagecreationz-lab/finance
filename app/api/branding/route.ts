import { AuthError, requireAdmin, requireSession } from '@/lib/auth';
import { getSupabaseAdmin, hasSupabaseConfig, STORAGE_BUCKET } from '@/lib/supabase-admin';
import { writeLocalBranding } from '@/lib/local-branding-store';
import { appendAuditLog } from '@/lib/audit-log';

export const runtime='nodejs';
const allowedTypes=new Set(['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon']);
const hasSupabase=hasSupabaseConfig;
const isLocal=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);

export async function POST(request:Request){

  try{
    const session=requireSession(request);requireAdmin(session);
    const form=await request.formData(),logo=form.get('logo'),favicon=form.get('favicon');
    if(!(logo instanceof File)&&!(favicon instanceof File))return Response.json({error:'Choose a logo or favicon'},{status:400});
    for(const [kind,key,value] of [['logo','branding/logo',logo],['favicon','branding/favicon',favicon]] as const){
      if(!(value instanceof File)||value.size===0)continue;
      if(value.size>2*1024*1024)return Response.json({error:'Each branding image must be smaller than 2 MB'},{status:400});
      if(!allowedTypes.has(value.type))return Response.json({error:'Use PNG, JPG, WebP, SVG or ICO images'},{status:400});
      if(!hasSupabase()&&isLocal(request)){await writeLocalBranding(kind,value);continue}
      const result=await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(key,value,{contentType:value.type,upsert:true});
      if(result.error)throw new Error(result.error.message);
    }
    await appendAuditLog(request,session,'update_branding',{logo_changed:logo instanceof File&&logo.size>0,favicon_changed:favicon instanceof File&&favicon.size>0});
    return Response.json({ok:true,storage:hasSupabase()?'supabase':'local-file'});
  }catch(error){
    const message=error instanceof Error?error.message:'Branding upload failed';
    return Response.json({error:message},{status:error instanceof AuthError?error.status:message.startsWith('Supabase is not configured')?503:500});
  }
}




