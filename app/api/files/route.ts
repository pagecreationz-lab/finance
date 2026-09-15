import { appendAuditLog } from '@/lib/audit-log';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin, requireSession } from '@/lib/auth';
import { getSupabaseAdmin, hasSupabaseConfig, STORAGE_BUCKET } from '@/lib/supabase-admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const localRequest=(request:Request)=>['localhost','127.0.0.1','::1'].includes(new URL(request.url).hostname);
const useLocal=(request:Request)=>!hasSupabaseConfig()&&(process.env.NODE_ENV!=='production'||localRequest(request));
const uploadRoot=()=>process.env.FUNDFLOW_LOCAL_UPLOAD_PATH||path.join(process.cwd(),'.local-data','uploads');
const safeKey=(value:string)=>value.startsWith('foreclosures/')&&!value.includes('..')&&!value.includes('\\')&&value.length<240;
const mime=(key:string)=>key.endsWith('.pdf')?'application/pdf':key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg';
const fail=(error:unknown)=>{const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;return Response.json({error:error instanceof Error?error.message:'File request failed'},{status})};

export async function POST(request:Request){
  try{
    const session=requireSession(request);requireAdmin(session);
    const form=await request.formData(),file=form.get('proof');
    if(!(file instanceof File)||!file.size)return Response.json({error:'Select a proof file'},{status:400});
    if(file.size>10*1024*1024)return Response.json({error:'Proof must be 10 MB or smaller'},{status:400});
    const lowerName=file.name.toLowerCase();
    const fileType=allowed.has(file.type)?file.type:lowerName.endsWith('.pdf')?'application/pdf':lowerName.endsWith('.png')?'image/png':lowerName.endsWith('.jpg')||lowerName.endsWith('.jpeg')?'image/jpeg':lowerName.endsWith('.webp')?'image/webp':'';
    if(!fileType)return Response.json({error:'Proof must be a PDF, PNG, JPEG or WebP file'},{status:400});
    const extension=fileType==='application/pdf'?'.pdf':fileType==='image/png'?'.png':fileType==='image/webp'?'.webp':'.jpg';
    const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'proof';
    const key=`foreclosures/${crypto.randomUUID()}-${base}${extension}`,bytes=Buffer.from(await file.arrayBuffer());
    if(useLocal(request)){const target=path.join(/* turbopackIgnore: true */ uploadRoot(),...key.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes)}
    else{const result=await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(key,bytes,{contentType:fileType,upsert:false});if(result.error)throw new Error(result.error.message)}
    await appendAuditLog(request,session,'upload_proof',{id:key});
    return Response.json({key,name:file.name});
  }catch(error){return fail(error)}
}

export async function GET(request:Request){
  try{
    const session=requireSession(request);requireAdmin(session);
    const key=new URL(request.url).searchParams.get('key')||'';if(!safeKey(key))return Response.json({error:'Invalid proof file'},{status:400});
    let bytes:ArrayBuffer;
    if(useLocal(request)){const buffer=await readFile(path.join(/* turbopackIgnore: true */ uploadRoot(),...key.split('/')));bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength) as ArrayBuffer}
    else{const result=await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(key);if(result.error)throw new Error(result.error.message);bytes=await result.data.arrayBuffer()}
    await appendAuditLog(request,session,'view_proof',{id:key});
    return new Response(bytes,{headers:{'Content-Type':mime(key),'Content-Disposition':`inline; filename="${path.basename(key)}"`,'Cache-Control':'private, no-store'}});
  }catch(error){return fail(error)}
}