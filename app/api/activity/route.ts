import { access } from '@/lib/rbac';
import { appendAuditLog } from '@/lib/audit-log';
export async function POST(request:Request){
  try{
    const {session}=await access(request);
    if(!['admin','manager','agent'].includes(session.role))return Response.json({error:'Forbidden'},{status:403});
    const body=await request.json();
    const activity=String(body.activity||'').trim().slice(0,120);
    if(!activity)return Response.json({error:'Activity is required'},{status:400});
    await appendAuditLog(request,session,'ui_activity',{activity});
    return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Activity logging failed'},{status:401})}
}