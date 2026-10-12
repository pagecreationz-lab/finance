# Current rule: upfront deduction, full principal repayment

This supersedes the older net-repayment formula in UPFRONT_INTEREST_SETUP.md.

For ₹10,000 at 10%, interest deducted is ₹1,000, customer receives ₹9,000, and total repayable is ₹10,000. Rates remain variable. Daily loans have 100 payments starting on the loan start date; weekly loans have 10 payments starting one week later; yearly loans have 12 monthly payments starting one month later. For this example installments are ₹100 daily, ₹1,000 weekly, or four monthly payments of ₹834 followed by eight of ₹833.

Open loans convert once to `upfront_principal_v2`. Credits are computed from their previous model's repayable total minus stored balance (not inferred again from raw receipts). Thus an old ₹9,000-repayable loan with ₹8,910 balance converts to ₹9,910, preserving ₹90 collected. Its first ₹100 installment has ₹10 remaining; collection completes that remainder before advancing dates. Changing interest rate does not change principal repayable or already credited payments. Settled/foreclosed historical loans are not reopened. No receipt/signature/correction is rewritten.

## Deployment

Back up the database first. Because the live database previously reported missing migrations, run `supabase/principal-repayment-preflight.sql` (read-only) and inspect the results before applying anything. Do not blindly rerun old migrations or the full schema.

Once all checks are true, apply `supabase/migrations/20261012040751_upfront_principal_repayment.sql` as one complete transaction, then deploy the matching app. The migration audits each conversion and is safe to rerun; it aborts rather than partially converting if an open loan has invalid terms/credits or a non-fixed rate requiring review. Local storage uses the same credit-preserving conversion; unsupported records remain historical for review. This code change has not modified a live database or deployed to Vercel.
