# Customer, loan and signed-collection update

Before deploying this version to Vercel, run `supabase/customer-loan-signature-migration.sql` in the SQL Editor of the same Supabase project used by the application. It adds columns and the transactional collection function without deleting existing records. Do not rerun the full schema against an existing production database: that file also contains legacy seed data.

Then deploy the updated source. No new environment variables are required.

## Behaviour

- Occupation is required for customer creation, editing and CSV import (column 5). Existing missing occupations display “Not recorded” until entered.
- New and edited loans require a planned end date. The next due date must fall between the start and end dates. Existing end dates remain unknown until updated.
- Daily/Monthly collection ledgers show one row per date; Weekly uses days 1–7, 8–14, 15–21, 22–28 and 29–month-end. Yearly has 12 monthly rows. Each category includes receipts for loans with that return basis. Calculations use India time.
- Agent payments require a customer-drawn signature. Changing the selected loan, amount or payment method clears the signature. Signatures are private receipt data returned only through authenticated, role-scoped requests.
- A signature is captured handwriting, not a cryptographically verified identity or certificate-based digital signature.
- Signed receipts cannot be edited or deleted. Admin collections can omit signatures and are attributed to the administrator, not an arbitrary agent.
- Receipt creation, loan balance change and audit creation are one database transaction. Existing unsigned receipts remain available.

## Check after deployment

1. Create/edit a customer with occupation, then create a loan with valid start/due/end dates.
2. As its assigned agent, confirm an unsigned payment is rejected; sign and save once.
3. Reopen the receipt as agent and admin and confirm the signature is visible and editing disabled.
4. Check the corresponding ledger month/year and totals. Verify another agent cannot see the customer's receipt.

The migration must be applied before the new payment handler can work. Local build and regression tests do not apply changes to the hosted database.
