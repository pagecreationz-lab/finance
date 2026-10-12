# Agent-entered missed-day penalties

Implemented for open 100-day daily loans using `upfront_principal_v2`.

In **Collections → Missed-day penalties**, an assigned agent selects overdue unpaid dates and enters one whole-rupee total. The reason is optional. Admin Manager or Super Admin approves or rejects; neither enters charges through this feature. Agents cannot approve their own requests. Existing Collections/Loans permissions apply; entering a request also requires Record payments.

Pending/rejected requests do not affect payments. Approved charges are added to the next recorded installment. For example, ₹100 installment + ₹50 approved penalty = exactly ₹150 collected, of which only ₹100 reduces principal. Receipts/downloads show the split. After collection the penalty is linked to that receipt and cannot be collected again. Dates already covered by a pending, approved or collected request cannot be charged twice. Approval rechecks assignment and unpaid dates.

## Database deployment (not run automatically)

Back up production first. Apply all existing prerequisite migrations, including receipt corrections and `20261012040751_upfront_principal_repayment.sql`, before the new migration. Do not rerun the whole consolidated schema on an existing database.

Run these read-only checks first:

```sql
select to_regclass('public.receipt_corrections') as corrections,
       to_regclass('public.collection_ledger') as ledger,
       to_regprocedure('public.rmv_exact_installment(public.loans)') as exact_installment,
       to_regprocedure('public.rmv_upfront_dates(date,text)') as schedule,
       to_regclass('public.penalty_requests') as penalties;
select distinct interest_model from public.loans;
```

The first four results must exist, and the full-principal migration must already be applied. If `penalties` exists, check migration history rather than running this migration twice. If any prerequisite is missing, resolve it first.

Apply **`supabase/migrations/20261012045946_agent_penalty_approval.sql` once**, then deploy the updated application. Local-file development needs no SQL. Application and database updates must be coordinated: the new data endpoint expects the penalty table/view column.

Verify with a test assigned daily loan: submit ₹50, approve as manager, check next payment increased by ₹50, collect, and confirm principal decreased only by the installment. Also verify Super Admin approval and rejection.

## Safeguards and limits

- The migration is transactional, keeps RLS enabled, and restricts tables/RPCs to the server service role. Proposal/review/payment operations serialize on the loan row.
- Foreclosure requires pending requests to be resolved and approved penalties collected. Approved penalties cannot be silently waived by closing a loan.
- Receipt corrections may adjust only the installment portion; reversing/refunding an already collected penalty is not supported. Original receipts and penalty decisions remain immutable.
- Ledger/report Collected totals are gross cash received, including penalties; loan balances and principal-paid totals exclude penalties.
- No automatic penalty rate, compounding, retroactive paid-day charges, weekly/monthly penalties, or live data changes are introduced.

## Verification

`node tests/penalties.cjs` tests local role enforcement, duplicate dates, both reviewers, exact total, single collection and principal protection. `node tests/penalties-sql.cjs <isolated @electric-sql/pglite module path>` exercises the migration and PostgreSQL behavior without production access.
