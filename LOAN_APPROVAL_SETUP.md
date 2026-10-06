# Agent-created loan approval

## Deployment

Apply `supabase/migrations/20261006123141_agent_loan_approval.sql` after the existing loan end-date, RBAC and customer approval migrations, then deploy. The migration was verified in an isolated PostgreSQL runtime, not applied to your live project. Do not rerun the full schema/seed script on an existing database or blindly push unbaselined historical migrations.

## Workflow

- Agent opens **Loans → Create loan** and chooses an approved customer currently assigned to them. Enter principal, full-term flat interest rate, daily/weekly/monthly return basis, start/due/end dates, security type and optional remarks.
- The server derives the agent from the active session; clients cannot select another assignee, set approval status or bypass the approval flow.
- Pending requests are stored separately from actual loans. Agents can see only their request reference, status and dates—not pending loan terms. No balances, reports, reminders or collection records include the requested loan yet.
- Admin Manager opens **Loans → Agent loan approvals**, reviews all terms, and approves or rejects. The review reason is optional (maximum 1,000 characters). Super Admin retains oversight access.
- Approval checks the agent is still active and the customer is still active and assigned to them, then creates the loan with balance equal to principal plus full-term flat interest (after applying FLAT_INTEREST_SETUP.md), records the decision and writes the audit event in one transaction. Approval cannot silently reassign a customer.
- Approved loans appear in the agent's Loans screen and existing customer/collection views. Access follows the customer's assignment, consistently with existing loans. If the customer was reassigned or archived before approval, reject the request and submit a new eligible request.
- Rejected requests never become loans. Repeated approval attempts cannot create duplicates. Direct agent loan creation remains forbidden.

## Permissions

Access Control includes **Submit loans for manager approval** for agents and **Approve agent-created loans** for managers. Both require View customers and View loans. The SQL migration adds these actions only to roles already allowed both views. For local-file installations with saved policies, Super Admin must enable the new permissions manually. New default policies include them.

Agent loan requests do not upload security documents; Super Admin's existing loan management remains available after approval.

## Verification

- `node tests/loan-approvals.cjs`: validation, ownership, pending privacy, zero pending financial impact, direct-create/self-approval denial, concurrent approvals, approved details and collection access, rejection, assignment changes, archived agents, permission revocation and audit events.
- `node tests/loan-approvals-sql.cjs <temporary-pglite-module-path>`: executes migration and transaction checks in isolated PostgreSQL, including anonymous access denial. Uses a temporary pinned `@electric-sql/pglite@0.5.8` installation, not an app dependency.

The Supabase skills informed the service-role-only SECURITY INVOKER function, separate RLS-enabled request table and short approval transaction with row locks. No live database advisors or live deployment were run.
