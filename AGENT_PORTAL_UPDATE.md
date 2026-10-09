# Agent portal update

- Loan request references and IDs are hidden in the agent Loans screen; internal identifiers remain unchanged.
- Agent payment recording no longer asks for a signature. Existing signed receipts and audit history are retained.
- Notifications open automatically when the agent portal loads after login, with an explicit Close button.
  They include assigned due/overdue loans, the agent's customer/loan approval statuses, and recent recorded payments.
  No collection-approval workflow exists: collection alerts describe recorded payments, not invented approval states.
  Closing does not reopen the popup on background refresh; the bell still opens it.

Before deploying, apply supabase/migrations/20261008084928_optional_agent_signature.sql
to the database used by Vercel, after the existing collection and RBAC migrations.
The migration preserves the currently installed function's access checks and grants.
No live database change or deployment was performed by this update.
