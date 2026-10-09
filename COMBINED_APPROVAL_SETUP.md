# Combined customer and loan approval

## Deployment

Apply supabase/migrations/20261008095251_combined_customer_loan_approval.sql after the existing
agent customer approval, agent loan approval and flat-interest migrations. Then deploy the matching app.
This update has not been applied to the live database.
Do not rerun the schema/seed script on an existing database.

The unique loan-number index checks existing IDs case-insensitively. If historical duplicates exist,
the migration fails without changing them; review those records rather than deleting or renumbering blindly.

## Agent workflow

In Loans → Customers & loans → Create customer / loan:

1. Choose Create new customer + loan, or an existing assigned customer for an additional loan.
2. Enter customer name, phone, occupation and optional email for a new customer.
3. Enter a manual loan number and all loan terms.
4. Submit once. No customer or loan becomes active while the combined request is pending.
5. Admin Manager reviews both sets of details in the Loans approval panel.
6. Approval creates both records atomically and assigns the customer to the submitting agent.
   Rejection creates neither. A failure rolls back both records and leaves the request pending.

The previous standalone customer section now shows request history, without a separate agent creation form.
Previously submitted standalone customer and loan requests can still be reviewed.

## Permissions and numbering

New-customer submissions require both Submit customers and Submit loans permissions plus both view permissions.
Combined reviews require both Approve customers and Approve loans. Super Admin retains full access.
These checks apply on the server and in the database, not just to button visibility.

Loan numbers are required for new agent submissions and direct Admin/Manager loan creation.
Use 1–40 letters, digits, slashes, hyphens or underscores, starting with a letter or digit.
Numbers are trimmed and uppercased. Existing IDs are unchanged; legacy pending requests retain their
original generated-number behavior when approved.
Duplicate active loan numbers and duplicate pending request numbers are rejected.
If a direct admin-created loan uses a number while an agent request is pending, approval of that request
fails safely; reject and resubmit with a different number.

## Verification

Local API and isolated PostgreSQL tests cover pending privacy, combined approval, manual numbers,
duplicate/repeated requests, rejection, assignment, permissions, and rollback after customer insertion.
No production data was used. Supabase transaction and least-privilege guidance informed the implementation.
