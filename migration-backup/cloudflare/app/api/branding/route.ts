import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';

const ADMIN_EMAILS=new Set(['seedy@sites.test']);
const allowedTypes=new Set(['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon']);

async function isAdmin(request:Request){
  const user=await getChatGPTUser();
  if(user!==null&&ADMIN_EMAILS.has(user.email.toLowerCase())) return true;
  const hostname=new URL(request.url).hostname;
  return hostname==='localhost'||hostname==='127.0.0.1';
}

export async function POST(request:Request){
  if(!await isAdmin(request)) return Response.json({error:'Super admin access required'},{status:403});
  const form=await request.formData();
  const logo=form.get('logo');
  const favicon=form.get('favicon');
  if(!(logo instanceof File)&&!(favicon instanceof File)) return Response.json({error:'Choose a logo or favicon'},{status:400});
  const uploads:Array<Promise<unknown>>=[];
  for(const [key,value] of [['branding/logo',logo],['branding/favicon',favicon]] as const){
    if(!(value instanceof File)||value.size===0) continue;
    if(value.size>2*1024*1024) return Response.json({error:'Each branding image must be smaller than 2 MB'},{status:400});
    if(!allowedTypes.has(value.type)) return Response.json({error:'Use PNG, JPG, WebP, SVG or ICO images'},{status:400});
    uploads.push(env.FILES.put(key,await value.arrayBuffer(),{httpMetadata:{contentType:value.type},customMetadata:{filename:value.name}}));
  }
  await Promise.all(uploads);
  return Response.json({ok:true});
}