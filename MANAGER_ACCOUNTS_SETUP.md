# Edit and delete Admin Managers

For an existing Supabase deployment, run `supabase/manager-edit-migration.sql` after the RBAC migration, then deploy the updated application. Do not rerun the seed schema on your production database. The SQL migration has not been applied or tested on a live database by this change.

Under Access Control → Manager accounts, Super Admin can:

- Edit a manager's name and username; optionally set a new password (10–256 characters). A blank password keeps the existing password.
- Delete an active or disabled manager after confirmation. The account disappears from the list and can no longer sign in or use an existing session on protected APIs.
- Continue using Enable/Disable for reversible access suspension.

Deletion is history-preserving: the manager's ID, financial records and audit trail remain, but credentials are removed and the account cannot be restored through Enable. Its username remains reserved. Manager changes are audited without storing passwords in audit metadata.

Verified with `node tests/rbac.cjs` and `npm run build` using an isolated temporary local database.
