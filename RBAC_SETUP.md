# Role-based access

## Deploy

1. Back up your Supabase database. The existing authentication, audit, reminders and customer-loan-signature migrations must already be applied.
2. Run `supabase/rbac-migration.sql` in the Supabase SQL Editor before deploying this code. It preserves users and financial records, adds the permissions table and restricted transactional functions, and updates the collection function to accept authorized managers.
3. Redeploy to Vercel. No new environment variables are required.
4. Sign in as Super Admin, open **Access Control**, and create an Admin Manager account with its own username/password. Managers use the existing sign-in page.

## Defaults and fixed safety boundaries

- **Super Admin:** full access, including Access Control. The permission editor cannot lock out this role.
- **Admin Manager:** view all customers, loans, collections and collection agents; create customers, loans and collection agents; assign customers; reports and manual reminders. Edit/delete permissions are off by default and can be enabled individually.
- **Collection Agent:** view assigned customer/loan records, own collection ledger and reports, record signed payments and send reminders for assigned customers. The super admin can disable these capabilities. Agents cannot be granted account creation, broad customer access or edit/delete privileges.
- Customer sign-in remains paused as previously configured; this update does not enable it.
- Role administration, reminder provider credentials/consent configuration, branding, admin profile, foreclosure/reopening, audit-log access and collection corrections remain super-admin-only. Signed receipts and audit records remain immutable.

Permission changes are checked on every protected data/reminder API request, not only at sign-in. Navigation refreshes on focus or within 30 seconds. Disabling a manager invalidates access on their next protected request. RBAC changes and manager account creation/disable operations are audited.

The module dependencies shown by the editor are intentional: for example, creating a loan requires viewing loans and customers. Remove dependent actions before disabling their required views.

## Verification

- `node tests/rbac.cjs` tests manager login/default access, denied escalation, live revocation, account disable, dataset redaction and audit entries with isolated local storage.
- Run the existing login, reminder, collection and loan tests as regressions.
- Test the hosted manager account after applying the SQL migration. Local tests and builds do not execute PostgreSQL migrations or deploy the site.
