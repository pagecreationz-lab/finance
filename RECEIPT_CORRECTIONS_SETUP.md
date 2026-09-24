# Receipt corrections

Apply `supabase/receipt-corrections-migration.sql` in the Supabase SQL Editor for the project used by this deployment, after the existing customer-loan-signature, audit and RBAC migrations. Apply it **before deploying this code**, because data reads now use the `collection_ledger` view. Do not run the full seed schema on a populated production database.

No live database migration has been applied by this implementation.

In Collections (including Daily, Weekly and Monthly), use **Receipt corrections & approvals**. Choose an individual receipt, enter its corrected whole-rupee amount and a reason of 10–1,000 characters. Zero reverses that receipt. Super Admin applies directly; Admin Manager submits a pending request and Super Admin must approve or reject with a reason. Agent access remains read-only.

Super Admin can revoke or grant the manager's `Request receipt corrections` permission under Access Control. Existing local policies need this permission enabled there; the Supabase migration adds it for managers already permitted Collections.

An approved correction adjusts the loan balance by the difference between the previous effective payment and the new amount. Ledger totals, reports and dashboards use approved effective amounts. Pending/rejected requests do not affect financial values. Corrections stay in the original payment date's ledger period and loan return category.

Original receipt amounts, signatures, dates, collector, method and proof are preserved. Downloads distinguish the original signed amount from the corrected amount. This workflow corrects amounts only. Foreclosed loans must be reopened before correction. Stale requests must be rejected and resubmitted against the latest payment amount.

Audit entries record proposals and decisions with reasons and before/after amounts. Supabase applies approval, loan balance and audit records atomically. Test the migration on a staging copy before production; SQL has not been executed against a live PostgreSQL instance here.
