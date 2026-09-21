# RMV Finance Vercel deployment

## 1. Create the Supabase backend

1. Create a Supabase project.
2. Open **SQL Editor** in Supabase.
3. Run the complete [`supabase/schema.sql`](supabase/schema.sql) file once.
4. In **Project Settings > API Keys**, copy the project URL and secret key.
5. For an existing RMV Finance database, also run `supabase/auth-migration.sql` once.

The schema creates the finance tables, indexes, sample records, Row Level Security,
and the private `fundflow-files` storage bucket.

## 2. Add Vercel environment variables

Import the repository into Vercel and add these variables for Production, Preview,
and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-secret-key
FUNDFLOW_ADMIN_USER=admin
FUNDFLOW_ADMIN_PASSWORD=use-a-long-random-password
FUNDFLOW_SESSION_SECRET=use-a-different-32-character-random-secret
NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
```

Never expose `SUPABASE_SECRET_KEY` in browser code or commit it to Git.

## 3. Deploy

Vercel should detect **Next.js** automatically. Use:

```text
Build command: npm run build
Output directory: leave blank
Install command: npm install
```

After the first deployment, update `NEXT_PUBLIC_SITE_URL` to the final Vercel or
custom-domain URL and redeploy.

RMV Finance uses its own sign-in page. The super admin signs in with `FUNDFLOW_ADMIN_USER` and `FUNDFLOW_ADMIN_PASSWORD`; agent credentials are created and managed by the super admin. Customer portal login and credential creation are temporarily paused unless `FUNDFLOW_CUSTOMER_LOGIN_ENABLED=true`.

## 4. Local Supabase testing

Copy `.env.example` to `.env.local`, replace the placeholders, then run:

```powershell
npm run dev -- --port 3002
```

Open <http://localhost:3002>.

## Foreclosure reopening and activity logs

Before deploying this version, run supabase/audit-reopen-migration.sql in the Supabase SQL Editor. It is additive, includes the earlier foreclosure columns, and creates the immutable audit table and transactional foreclosure/reopen function. Then deploy the updated application to Vercel using the existing server-only Supabase credentials.

Super admin: Loans → select a foreclosed loan → Reopen loan → enter a reason → Confirm reopen. Reopening reverses the foreclosure settlement credit and waiver and restores the full pre-foreclosure balance. Existing receipts remain recorded. Repeated foreclosure/reopening cycles each get their own log entries.

The admin Logs section records server-confirmed record changes, sign-ins/sign-outs, proof uploads/views, and separately labelled browser button interactions. It includes actor, role, time, record ID, and relevant details; passwords are excluded. Load older events to page through history. Search and CSV export apply to loaded entries.

No application role can edit or delete audit logs. PostgreSQL triggers block updates, deletes, and truncation; the local development store also rejects changes to existing logs. This is application/database-role enforcement, not protection against a database owner deliberately changing the schema or an OS administrator editing local files.

Logging starts with this version; prior activity is not fabricated. Validation was performed against isolated local records; the hosted Supabase migration and deployment must be applied before the hosted feature is available.
## Cleared-customer deletion

After the audit/reopen migration, run supabase/customer-deletion-migration.sql before deploying this version. Customer deletion now archives eligible borrowers from the active list while retaining their ledger references. It is blocked if any loan has a positive balance or a status other than closed/foreclosed. The response and immutable log include deleted and blocked IDs for mixed bulk selections. Reopening a deleted customer's loan restores the customer to the active list with no assigned agent. The PostgreSQL function checks eligibility and records the deletion results in one transaction.
## SMS and WhatsApp reminders

See REMINDERS_SETUP.md. Apply supabase/reminders-migration.sql, add FUNDFLOW_NOTIFICATION_KEY and CRON_SECRET to Production, then redeploy. Configure Twilio, approved templates and customer consent in Super Admin > Reminders. Automatic sending remains off until explicitly enabled.
