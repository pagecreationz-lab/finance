# FundFlow Vercel deployment

## 1. Create the Supabase backend

1. Create a Supabase project.
2. Open **SQL Editor** in Supabase.
3. Run the complete [`supabase/schema.sql`](supabase/schema.sql) file once.
4. In **Project Settings > API**, copy the project URL and service-role key.

The schema creates the finance tables, indexes, sample records, Row Level Security,
and the private `fundflow-files` storage bucket.

## 2. Add Vercel environment variables

Import the repository into Vercel and add these variables for Production, Preview,
and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FUNDFLOW_ADMIN_USER=admin
FUNDFLOW_ADMIN_PASSWORD=use-a-long-random-password
NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or commit it to Git.

## 3. Deploy

Vercel should detect **Next.js** automatically. Use:

```text
Build command: npm run build
Output directory: leave blank
Install command: npm install
```

After the first deployment, update `NEXT_PUBLIC_SITE_URL` to the final Vercel or
custom-domain URL and redeploy.

The deployed app uses browser Basic Authentication with `FUNDFLOW_ADMIN_USER` and
`FUNDFLOW_ADMIN_PASSWORD`. Localhost remains available without that prompt.

## 4. Local Supabase testing

Copy `.env.example` to `.env.local`, replace the placeholders, then run:

```powershell
npm run dev -- --port 3002
```

Open <http://localhost:3002>.
