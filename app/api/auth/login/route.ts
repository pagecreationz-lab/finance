import { appendAuditLog } from '@/lib/audit-log';
import {
  createSessionCookie,
  verifyPassword,
  verifyPlainCredential,
  type AppRole,
} from '@/lib/auth';
import { getSupabaseAdmin, hasSupabaseConfig } from '@/lib/supabase-admin';
import { readLocalStore } from '@/lib/local-data-store';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const localRequest = (request: Request) =>
  ['localhost', '127.0.0.1', '::1'].includes(new URL(request.url).hostname);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    } | null;
    if (
      !body ||
      typeof body.username !== 'string' ||
      typeof body.password !== 'string' ||
      body.username.length > 100 ||
      body.password.length > 256
    )
      return reply({ error: 'Enter a valid username and password' }, 400);
    const username = String(body.username || '')
        .trim()
        .toLowerCase(),
      password = String(body.password || '');
    if (!username || !password)
      return Response.json(
        { error: 'Username and password are required' },
        { status: 400 },
      );
    const adminUser = (
      process.env.FUNDFLOW_ADMIN_USER ||
      (process.env.NODE_ENV !== 'production' ? 'admin' : '')
    )
      .trim()
      .toLowerCase();
    const adminPassword =
      process.env.FUNDFLOW_ADMIN_PASSWORD ||
      (process.env.NODE_ENV !== 'production' ? 'FundFlow@123' : '');
    let account: { id: string; name: string; role: AppRole } | null = null;
    let storedAdminExists = false;
    {
      let user:
        | {
            id: string;
            name: string;
            role: string;
            password_hash?: string | null;
          }
        | undefined;
      if (!hasSupabaseConfig() && localRequest(request)) {
        const data = await readLocalStore();
        storedAdminExists = data.users.some((item) => item.role === 'admin');
        user = data.users.find(
          (item) => item.username?.toLowerCase() === username,
        );
      } else {
        const db = getSupabaseAdmin();
        const signal = AbortSignal.timeout(10000);
        const [result, adminResult] = await Promise.all([
          db
            .from('users')
            .select('id,name,role,password_hash')
            .eq('username', username)
            .in('role', ['admin', 'agent', 'customer'])
            .abortSignal(signal)
            .maybeSingle(),
          db
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .limit(1)
            .abortSignal(signal),
        ]);
        if (result.error)
          throw new Error(
            ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(
              result.error.code,
            )
              ? 'Login database setup is incomplete. Apply the authentication migration.'
              : 'Login database is unavailable. Check the Production Supabase URL and server secret key, then redeploy.',
          );
        if (adminResult.error)
          throw new Error(
            'Administrator lookup is unavailable. Check the Production Supabase configuration.',
          );
        storedAdminExists = Boolean(adminResult.data?.length);
        user = result.data || undefined;
      }
      let passwordMatches = false;
      try {
        passwordMatches = Boolean(
          user && verifyPassword(password, user.password_hash),
        );
      } catch {
        throw new Error(
          'Stored account credentials need repair by the administrator.',
        );
      }
      if (user && passwordMatches) {
        if (
          user.role === 'customer' &&
          process.env.FUNDFLOW_CUSTOMER_LOGIN_ENABLED !== 'true'
        )
          return Response.json(
            { error: 'Customer portal login is temporarily paused' },
            { status: 403 },
          );
        if (['admin', 'agent', 'customer'].includes(user.role))
          account = {
            id: user.id,
            name: user.name,
            role: user.role as AppRole,
          };
      }
    }
    if (
      !account &&
      !storedAdminExists &&
      username === adminUser &&
      verifyPlainCredential(password, adminPassword)
    )
      account = { id: 'super-admin', name: 'Suresh Kumar', role: 'admin' };
    if (!account)
      return Response.json(
        { error: 'Invalid username or password' },
        { status: 401 },
      );
    await appendAuditLog(
      request,
      { ...account, exp: Date.now() + 28800000 },
      'sign_in',
      {},
    );
    return Response.json(
      { user: account },
      {
        headers: {
          'Set-Cookie': createSessionCookie(account, request),
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Login is temporarily unavailable. Please try again.',
      },
      503,
    );
  }
}
