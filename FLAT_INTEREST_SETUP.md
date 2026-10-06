# Full-term flat-interest loans

The rate is charged once on original principal, not annually and not on a reducing balance.
For ₹500,000 at 10%, interest is ₹50,000 and total repayable is ₹550,000.
Outstanding = total repayable minus credited payments. Existing receipt records remain immutable.

## Deployment

Back up the database, then apply supabase/migrations/20261006125754_flat_term_loan_calculation.sql
after the existing loan/collection, RBAC and loan-approval migrations. Deploy the matching app code.
This migration has not been applied to the hosted database by this change.

The migration converts only eligible open fixed-rate loans with valid dates and principal-only balances.
It adds term interest once, preserves their previous principal-minus-balance credits and writes an audit entry.
For example, a ₹500,000 loan with an existing ₹450,000 balance becomes ₹500,000 outstanding at 10%.
Closed, foreclosed, floating-rate, missing-date and ambiguous loans stay on the legacy model, without
changing balances. Review these separately; do not reset their model to force conversion.
The existing next-due date becomes the first schedule anchor for converted loans.
Local-file storage performs the equivalent normalization and persists it on its next successful mutation.

## Installments

First due date through end date determines the installment count. Daily/weekly advances by 1/7 days;
monthly/yearly dates preserve the anchor day, clamping to the last day of short months.
An end-date stub is included as a final installment. The total is split into whole rupees, with remaining
rupees allocated to the earliest installments. The schedule always sums exactly to total repayable.

Payments cover oldest installments first. Partial payments leave the due date unchanged; advance payments
advance it. Receipt corrections/reversals recalculate it. Closed loans display “Cleared”.
On open loans, changing the term interest rate preserves existing credits and adjusts outstanding by the
interest difference. Explicitly changing next due date resets the schedule anchor; other edits retain it.
Financial-term changes to closed/foreclosed loans are blocked. Foreclosure and reopening retain their
existing settlement workflow; waived amounts are not collection receipts.

Tests use isolated temporary storage and PostgreSQL; no live database is used.
