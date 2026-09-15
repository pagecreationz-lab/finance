import { getSupabaseAdmin, hasSupabaseConfig, STORAGE_BUCKET } from '@/lib/supabase-admin';
import { readLocalBranding } from '@/lib/local-branding-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const hasSupabase=hasSupabaseConfig;

export async function GET(request:Request){
  try{
    if(!hasSupabase()&&['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname)){
      const result=await readLocalBranding('favicon');
      return new Response(result.data,{headers:{'Content-Type':result.type||'image/x-icon','Cache-Control':'no-store'}});
    }
    const result=await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download('branding/favicon');
    if(result.error)return new Response(null,{status:404});
    return new Response(result.data,{headers:{'Content-Type':result.data.type||'image/x-icon','Cache-Control':'no-store'}});
  }catch{return new Response(null,{status:404})}
}


