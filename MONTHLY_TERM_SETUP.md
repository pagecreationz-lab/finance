# Monthly loan terms

New monthly loans require a start date and a later end date. Collections fall on monthly anniversaries, with a final collection on the selected end date if it falls between anniversaries. Principal is divided equally across those rows; whole-rupee rounding differences go to the earliest rows.

The entered interest percentage applies once to the entire term and is deducted upfront. For ₹10,000 at 10%, interest is ₹1,000, disbursement is ₹9,000, and principal repayment remains ₹10,000. Interest is not multiplied by the number of months or charged again for a partial month.

For example, 23 August to 8 December produces collections on 23 September, 23 October, 23 November and 8 December: ₹2,500 each for a ₹10,000 loan.

Daily remains 100 collections and weekly remains 10. Historical yearly records retain their existing 12-month schedules and display as Monthly. This migration does not update existing balances or receipts.

## Deployment

After the existing principal repayment and penalty approval migrations, apply `supabase/migrations/20261123053943_collect_all_due_installments.sql` if it has not already been applied. Then run `supabase/migrations/20261123061734_monthly_selected_term.sql` and deploy the updated application. Do not rerun older conversion migrations.

Back up the database and pause loan creation and collections while applying the migration and deploying, so the app and database use the same schedule rules. The consolidated schema includes these changes for fresh installations.
