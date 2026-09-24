import { access } from '@/lib/rbac';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{const {session,permissions}=await access(request);return Response.json({user:{...session,permissions}},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Access unavailable'},{status:typeof error==='object'&&error&&'status'in error?Number(error.status):503,headers:{'Cache-Control':'no-store'}})}
}