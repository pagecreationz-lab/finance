import { clearSessionCookie, readSession } from '@/lib/auth';
import { appendAuditLog } from '@/lib/audit-log';
export async function POST(request:Request){
  const session=readSession(request);
  if(session)await appendAuditLog(request,session,'sign_out',{});
  return Response.json({ok:true},{headers:{'Set-Cookie':clearSessionCookie(request)}});
}