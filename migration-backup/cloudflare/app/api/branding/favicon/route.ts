import { env } from 'cloudflare:workers';

export async function GET(){
  const object=await env.FILES.get('branding/favicon');
  if(!object) return new Response(null,{status:404});
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'no-store'}});
}