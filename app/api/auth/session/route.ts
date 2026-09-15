import { readSession } from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=readSession(request);
  return user?Response.json({user},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Not signed in'},{status:401});
}


