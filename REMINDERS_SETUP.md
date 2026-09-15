# SMS and WhatsApp reminders — setup

## What is implemented

Open **Reminders** in the super-admin sidebar (also linked from Settings). Agents have a Reminders menu with assigned open loans only. The old SMS/WhatsApp popup now uses this same working module.

- Super admin saves encrypted Twilio credentials, sender numbers, message text, approved WhatsApp template IDs, channel switches and agent-send permission.
- Automatic reminders: choose 3 days before, 2 days before, on the due date, or any combination. Choose due-date messages, outstanding-balance messages, or both.
- Both portals can preview and manually send a reminder for an eligible customer. Agents cannot change configuration or customer consent.
- Customer consent is required for each channel and phone number. Record actual consent, not assumed consent. If a phone number changes, new consent must be recorded.
- Full settled/closed/foreclosed loans and zero balances are excluded. Messages use the current stored next_due_date and outstanding balance, not a guessed installment amount.
- Each loan/due-date/channel/message-type can be attempted once per India calendar day, across admin, agent and scheduler. Changing the next due date starts a different reminder cycle.
- Submission, provider result, configuration requests and consent changes are recorded in the existing immutable Logs. Recent delivery statuses appear in Reminders.

## 1. Database migration

For Supabase, run **supabase/reminders-migration.sql** in the SQL editor. The existing audit_logs table and its immutability migration must already be installed (supabase/audit-reopen-migration.sql). This creates three private server-access-only tables:

- reminder_settings: provider configuration, with the auth token encrypted.
- reminder_consents: customer channel consent linked to the current phone number.
- reminder_events: original message attempts and current provider status.

No customer, loan or collection records are deleted. Existing local installations use the reminders section inside .local-data/fundflow.json (or FUNDFLOW_LOCAL_DATA_PATH). Vercel must use Supabase, never an ephemeral local file.

## 2. Server environment variables

Keep your existing Supabase and login environment variables. Add these in Vercel → Project → Settings → Environment Variables → Production:

| Variable | Value |
| --- | --- |
| FUNDFLOW_NOTIFICATION_KEY | 64 hexadecimal characters representing 32 random bytes |
| CRON_SECRET | A separate long random secret |

Generate each secret separately on your own computer:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

Do not paste these secrets into chat or commit them. Do not use a NEXT_PUBLIC_ prefix. Preserve and securely back up the encryption key: replacing it makes the stored Twilio token unreadable until you re-enter the token. Add the same variables to your local .env.local only if you need local sending, then restart the server.

Redeploy after adding the variables and migration. Provider account credentials themselves are entered from the super-admin Reminders screen, not from browser code.

## 3. Twilio and SMS

1. Set up a funded Twilio account and a sender approved for your destination country and lending use case.
2. In Reminders, enter the Account SID (AC...), Auth Token, and SMS sender number or approved alphanumeric sender ID.
3. Edit the due-date and balance SMS messages. Available placeholders: {customer}, {loan_id}, {balance}, {due_date}, {business_name}, {days_left}.
4. Enable SMS, keep automatic reminders OFF for initial testing, and save.

Indian domestic SMS may require DLT entity, sender and message-template registration/onboarding. Complete the applicable setup with Twilio before sending; saving a custom message here does not register or approve it. Verify eligibility with Twilio for your specific finance business and countries. Longer/Unicode SMS messages may incur multiple-segment charges. Trial accounts restrict recipients and capabilities.

Official guidance: https://www.twilio.com/en-us/guidelines/in/sms and https://www.twilio.com/en-us/legal/messaging-policy

## 4. WhatsApp

1. Register your WhatsApp business sender with Twilio and obtain the necessary business/use-case approvals.
2. Create TWO approved Content templates in Twilio: loan due date and outstanding balance. Use positional variables exactly as follows:

| Variable | App value |
| --- | --- |
| 1 | Customer name |
| 2 | Loan ID |
| 3 | Outstanding balance, formatted in INR |
| 4 | Next due date, YYYY-MM-DD |
| 5 | Business name |

Example template wording to submit for approval (approval is not guaranteed):

    Hello {{1}}, your loan {{2}} has an outstanding balance of INR {{3}}. Your next due date is {{4}}. Please contact {{5}} for payment details.

3. Enter the international sender number without the whatsapp: prefix, and the two Content SIDs (HX...) in Reminders.
4. Enable WhatsApp and save. Text customization must be approved in Twilio; editing an SMS template in this app does NOT change the approved WhatsApp text.

The app sends ContentSid and ContentVariables, not unrestricted WhatsApp text. Proactive messages outside the customer-service window require approved templates. Test only with your own opted-in number first.

Official guide: https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates

## 5. Consent and first manual send

1. In Super Admin → Reminders → Customer consent & opt-out, choose the customer.
2. Record the consent source/date and tick only the channels they agreed to. Save.
3. In Send a manual reminder, select a loan, channel and message type, then preview.
4. Check the recipient and message/template, tick the confirmation and click Send reminder. This contacts Twilio and can incur charges.
5. Check Recent reminder history. queued/accepted means provider submission, NOT delivery. Click Check delivery for the latest Twilio status.
6. Log in as an agent to verify that only their assigned customers are available. Super admin can disable agent sending centrally.

Untick consent to stop further sends. Monitor inbound opt-out requests in your provider inbox and promptly update these preferences; inbound-message processing is not included in this release.

## 6. Automatic reminders on Vercel

The included vercel.json schedules GET /api/cron/reminders at 03:30 UTC daily (09:00 Asia/Kolkata). Vercel sends CRON_SECRET as a Bearer authorization header. The endpoint rejects calls without it.

After the manual test succeeds, select reminder days and automatic types, enable Automatic reminders, and save. Selecting both types sends two messages per enabled channel. Nothing is sent automatically while disabled. Vercel cron runs on the production deployment; localhost needs an external scheduler invoking the same protected endpoint with that header.

Vercel Hobby timing can vary within an hour. Exact-time delivery is not guaranteed by the scheduler or provider. Monitor Vercel cron/function logs and reminder history. If a large run reaches the runtime budget it returns 503 with remaining work; an operator can safely invoke the protected job again on the SAME day because attempts are deduplicated. There is no multi-day catch-up queue. For portfolios beyond daily function capacity, configure a durable job queue before scaling.

Docs: https://vercel.com/docs/cron-jobs/manage-cron-jobs and https://vercel.com/docs/cron-jobs/usage-and-pricing

## Troubleshooting and limitations

- Database unavailable: apply the migration and verify server Supabase credentials.
- Encryption error: restore FUNDFLOW_NOTIFICATION_KEY or re-enter the Twilio auth token under the new key.
- Consent missing: record consent for the exact current customer number.
- Provider rejection: use the numeric Twilio error code and Twilio logs to check sender approval, template approval, account balance and recipient permissions.
- Unknown/submitting: the provider response was uncertain or execution was interrupted. Inspect Twilio before any retry; the app deliberately does not automatically retry the same day's attempt.
- Delivery history is provider-reported on demand, not a live status webhook. There is no user-facing edit/delete action for original reminder records. Global Logs are append-only for application users; database owners retain infrastructure-level authority.
- The automation uses the stored next_due_date, not a separately generated amortization schedule. Keep that date accurate when recording payments or emergency extensions.

## Verification performed

Run `node tests/reminders.cjs` for isolated, no-network tests. They cover authentication, role restrictions, encrypted token round-trip/redaction, consent, changed names/numbers, closed loans, archived agents, SMS and WhatsApp payloads, concurrent duplicate suppression, delivery-status refresh, provider rejection/timeout, 3/2/0-day scheduling and immutable audit records. Temporary test data is removed after the test.

No live customer messages or remote database changes were made during implementation. Production delivery still needs your provider configuration, migrations, deployment and an authorized live test.