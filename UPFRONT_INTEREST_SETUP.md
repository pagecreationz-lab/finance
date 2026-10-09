# Upfront interest and default loan terms

The current lending rule replaces the previous flat-interest-added model for new loans. The interest rate varies per loan (0% to less than 100%, up to four decimal places).

- Interest deducted = lending amount × rate / 100, rounded to the nearest whole rupee.
- Total repayable = lending amount minus interest deducted.
- Daily: 100 installments, first due on the start date, last due 99 days later.
- Weekly: 10 installments, first due one week after the start.
- Yearly: 12 monthly installments, first due one month after the start.

For ₹10,000 at 10%, interest is ₹1,000 and repayment totals ₹9,000: ₹90 daily, ₹900 weekly, or ₹750 monthly. Remainder rupees are assigned to the earliest installments. Monthly dates retain the start-day anchor and clamp to the last day of shorter months. End dates and next due dates are calculated automatically. Yearly loans appear in Monthly Collections because payments are monthly.

## Database deployment

Latest daily-date correction: apply `supabase/migrations/20261009135844_daily_start_date_installment.sql` after the prior migrations. Daily upfront loans now begin repayments on the start date (100 dates including that day). Existing open daily loans and pending requests have dates refreshed; balances and receipt history are preserved. Weekly/monthly terms and historical settled records are not backfilled. Local open daily loans refresh on load and persist on the next mutation. This migration has not been applied live.

Apply `supabase/migrations/20261008110332_upfront_interest_default_terms.sql` after the preceding migrations, including combined customer/loan approval. The consolidated `supabase/schema.sql` also includes this change. Do not rerun the entire consolidated schema against an existing production database.

The migration preserves previously credited amounts on eligible open fixed-interest loans. Settled loans and loans that cannot be safely converted (including credits exceeding the new repayable total) remain on their historical calculation and require manual review; inspect migration notices. Existing receipts are not rewritten. Local storage performs the corresponding conversion when normalized and persists it on the next successful mutation.

Pending requests created before migration may still display their originally requested dates; approval applies the current automatic terms. Review these with the borrower before approval.

This migration has been tested locally, but has not been applied to a live database or deployed to Vercel by this change.

## Exact agent collections

After the upfront migration, apply `supabase/migrations/20261009120605_exact_agent_installments.sql`. Agents can record only the exact remaining amount of the oldest unpaid installment, automatically populated in a read-only field. The database rechecks the amount while holding the loan lock; the local store enforces the same rule. Earlier partial credits reduce the next installment's remainder. Whole-rupee rounding follows the existing schedule. Loans without a supported schedule require admin review. Admin and manager collection/correction workflows remain unchanged. This does not impose a once-per-day restriction or prohibit advance installments.
