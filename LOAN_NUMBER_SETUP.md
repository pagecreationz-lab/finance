# Editable loan numbers

Apply `supabase/migrations/20261009132517_editable_loan_number.sql` after existing migrations, then deploy the application. No live database changes have been applied by this task.

Super Admin: open Loans, select a loan, edit Loan number and click Save loan number. Managers and agents cannot call this endpoint. Every successful change records the previous and new number in the audit log.

The editable number is separate from the immutable internal loan ID. Existing receipts, signatures, corrections, approvals and balances remain linked to that ID and are not rewritten. Historical receipt references can therefore retain the old ID. Loan listings, loan exports and collection search use the current number. Existing IDs and pending request numbers cannot be reused for another loan.
