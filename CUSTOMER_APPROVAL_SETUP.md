# Agent-created customer approval

For optional approval/rejection reasons, also apply `supabase/migrations/20261006122441_optional_customer_review_reason.sql` after the initial customer approval migration. Blank reasons are stored as null; decisions are still audited. Existing receipt-correction reason requirements are unchanged. This follow-up migration has not been applied to the live database.

Apply `supabase/migrations/20261006103723_agent_customer_approval.sql` to the Supabase project used by the app, after the existing occupation and RBAC migrations, then deploy. This migration has been tested in an isolated PostgreSQL instance, but has not been applied to your live project. Do not rerun the full schema/seed file on a populated database. The existing historical migrations are standalone scripts; do not blindly run a CLI database push against an unbaselined project.

## Workflow

1. Agent opens Assigned customers → Create customer. Name, phone and occupation are required; email is optional.
2. Submission is stored separately from active customers. The server forces assignment to the signed-in agent; the client cannot choose an agent or approval status.
3. The agent sees only a reference and status, not a pending customer profile or other customer details. Pending submissions cannot be used in loans, collections, reminders or reports.
4. Admin Manager opens Customers → Agent customer approvals. Review the details and approve/reject with an optional reason (up to 1,000 characters). Super Admin retains the same oversight ability.
5. Approval creates the active customer assigned to the submitting agent atomically with the decision and audit event. The agent can then access the customer through Assigned customers. Rejection creates no active customer. An archived agent's submission cannot be approved.

## Access Control

- Agent: `Submit customers for manager approval` plus `View customers`.
- Admin Manager: `Approve agent-created customers` plus `View customers`.
- Agents still cannot directly create active customers or approve their own requests.

The Supabase migration adds the new permissions only to existing roles already granted customer access. For local-file installations with saved role policies, Super Admin must enable the new permissions under Access Control. New default policies include them. Revoking either permission is enforced on the next API request.

## Verification

`node tests/customer-approvals.cjs` tests privacy, forced assignment, rejected/pending access, self-approval and direct-create denial, concurrent approvals, repeated submissions, archived agents, permission revocation and audit events.

`node tests/customer-approvals-sql.cjs <temporary-pglite-module-path>` tests migration SQL, transactional approval/audit, repeated approvals, inactive agents and public-role access denial in an isolated PostgreSQL runtime. Test runtime used: `@electric-sql/pglite@0.5.8`; not added to application dependencies.

The Supabase security guidance informed the separate pending table, enabled RLS, revoked public access, and service-role-only SECURITY INVOKER function. The app uses its existing custom sessions; Supabase anonymous/authenticated clients cannot directly read submissions or execute approval functions.
