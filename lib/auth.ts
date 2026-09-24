import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type AppRole = 'admin'|'manager'|'agent'|'customer';
export type AppSession = { id:string; name:string; role:AppRole; exp:number };
export const SESSION_COOKIE = 'fundflow_session';

const sessionSecret=()=>{
  const value=process.env.FUNDFLOW_SESSION_SECRET||process.env.FUNDFLOW_ADMIN_PASSWORD;
  if(value)return value;
  if(process.env.NODE_ENV!=='production')return 'fundflow-local-development-session-secret';
  throw new Error('FUNDFLOW_SESSION_SECRET is not configured');
};
const b64=(value:string)=>Buffer.from(value,'utf8').toString('base64url');
const sign=(payload:string)=>createHmac('sha256',sessionSecret()).update(payload).digest('base64url');
const safeEqual=(left:string,right:string)=>{
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
};

export function hashPassword(password:string){
  const salt=randomBytes(16).toString('hex');
  return ['scrypt',salt,scryptSync(password,salt,64).toString('hex')].join('$');
}
export function verifyPassword(password:string,stored:string|null|undefined){
  if(!stored)return false;
  const [method,salt,expected]=stored.split('$');
  if(method!=='scrypt'||!salt||!expected)return false;
  const actual=scryptSync(password,salt,64).toString('hex');
  return safeEqual(actual,expected);
}
export function verifyPlainCredential(value:string,expected:string|undefined){
  return Boolean(expected)&&safeEqual(value,expected!);
}
export function createSessionCookie(session:Omit<AppSession,'exp'>,request:Request){
  const payload=b64(JSON.stringify({...session,exp:Date.now()+8*60*60*1000}));
  const token=payload+'.'+sign(payload);
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`;
}
export function clearSessionCookie(request:Request){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
export function readSession(request:Request):AppSession|null{
  try{
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='));
    const token=cookie?.slice(SESSION_COOKIE.length+1);
    if(!token)return null;
    const [payload,signature]=token.split('.');
    if(!payload||!signature||!safeEqual(sign(payload),signature))return null;
    const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as AppSession;
    if(!session.id||!['admin','manager','agent','customer'].includes(session.role)||session.exp<=Date.now())return null;
    if(session.role==='customer'&&process.env.FUNDFLOW_CUSTOMER_LOGIN_ENABLED!=='true')return null;
    return session;
  }catch{return null}
}
export function requireSession(request:Request){
  const session=readSession(request);
  if(!session)throw new AuthError('Sign in is required',401);
  return session;
}
export class AuthError extends Error{constructor(message:string,public status:401|403){super(message)}}
export function requireAdmin(session:AppSession){
  if(session.role!=='admin')throw new AuthError('Only the super admin can perform this action',403);
}

