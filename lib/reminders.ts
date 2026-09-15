import { createHash } from 'node:crypto';
import { AuthError, type AppSession } from './auth';
import { appendAuditLog } from './audit-log';
import {
  claimReminder,
  decryptToken,
  finishReminder,
  readReminders,
  reminderFinance,
} from './reminder-store';
import {
  daysUntil,
  indiaDate,
  normalizePhone,
  renderReminder,
  type ReminderChannel,
  type ReminderKind,
  type ReminderSettings,
} from './reminder-types';
export async function scopeReminders(session: AppSession) {
  const data = await reminderFinance();
  if (session.role === 'customer')
    throw new AuthError('Customer reminder access is disabled', 403);
  if (
    session.role === 'agent' &&
    !data.users.some((user) => user.id === session.id && user.role === 'agent')
  )
    throw new AuthError('Agent account is no longer active', 403);
  const customers = data.users.filter(
    (user) =>
      user.role === 'customer' &&
      (session.role === 'admin' || user.assigned_agent_id === session.id),
  );
  const ids = new Set(customers.map((user) => user.id));
  return {
    customers,
    loans: data.loans.filter(
      (loan) =>
        ids.has(loan.customer_id) &&
        Number(loan.balance) > 0 &&
        !['closed', 'foreclosed'].includes(loan.status),
    ),
  };
}
export function providerReady(
  settings: ReminderSettings,
  channel: ReminderChannel,
  kind: ReminderKind,
) {
  if (!(channel === 'sms' ? settings.smsEnabled : settings.whatsappEnabled))
    throw new Error(channel + ' reminders are disabled by the super admin');
  if (
    !/^AC[a-fA-F0-9]{32}$/.test(settings.accountSid) ||
    !settings.tokenEncrypted
  )
    throw new Error('Configure the Twilio account SID and auth token first');
  if (channel === 'sms' && !settings.smsFrom)
    throw new Error('Configure an approved SMS sender');
  if (
    channel === 'whatsapp' &&
    (!/^\+[1-9]\d{7,14}$/.test(settings.whatsappFrom) ||
      !/^HX[a-fA-F0-9]{32}$/.test(
        kind === 'due' ? settings.dueContentSid : settings.balanceContentSid,
      ))
  )
    throw new Error(
      'Configure a WhatsApp sender and approved Content SID for this reminder type',
    );
}
export async function prepareReminder(
  session: AppSession,
  loanId: string,
  channel: ReminderChannel,
  kind: ReminderKind,
) {
  const [scope, store] = await Promise.all([
    scopeReminders(session),
    readReminders(),
  ]);
  if (session.role === 'agent' && !store.settings.agentCanSend)
    throw new AuthError('Agent reminders are disabled by the super admin', 403);
  const loan = scope.loans.find((row) => row.id === loanId);
  if (!loan)
    throw new AuthError('Loan is not open or is not assigned to you', 403);
  const customer = scope.customers.find((row) => row.id === loan.customer_id)!;
  const variables = {
    customer: customer.name,
    loan_id: loan.id,
    balance: Number(loan.balance).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    }),
    due_date: loan.next_due_date.slice(0, 10),
    business_name: store.settings.businessName,
    days_left: String(daysUntil(loan.next_due_date)),
  };
  const message = renderReminder(
    kind === 'due'
      ? store.settings.dueTemplate
      : store.settings.balanceTemplate,
    variables,
  );
  const phone = normalizePhone(customer.phone);
  const consent = store.consents.find(
    (row) => row.customer_id === customer.id && row.phone === phone,
  );
  return {
    loan,
    customer,
    variables,
    message,
    phone,
    consented: Boolean(consent?.[channel]),
    settings: store.settings,
  };
}
export async function sendReminder(
  request: Request,
  session: AppSession,
  loanId: string,
  channel: ReminderChannel,
  kind: ReminderKind,
  source: 'manual' | 'automatic',
) {
  const ready = await prepareReminder(session, loanId, channel, kind);
  providerReady(ready.settings, channel, kind);
  if (!/^\+[1-9]\d{7,14}$/.test(ready.phone))
    throw new Error('Customer mobile must be a valid international number');
  if (!ready.consented)
    throw new Error(
      'Super admin must record customer consent for this channel and current phone number',
    );
  const token = decryptToken(ready.settings.tokenEncrypted);
  const id = createHash('sha256')
    .update(
      [
        loanId,
        ready.loan.next_due_date.slice(0, 10),
        indiaDate(),
        channel,
        kind,
      ].join('|'),
    )
    .digest('hex');
  const claimed = await claimReminder({
    id,
    loan_id: loanId,
    customer_id: ready.customer.id,
    actor_id: session.id,
    actor_name: session.name,
    channel,
    kind,
    source,
    status: 'submitting',
    message:
      channel === 'sms'
        ? ready.message
        : 'Approved WhatsApp template ' +
          (kind === 'due'
            ? ready.settings.dueContentSid
            : ready.settings.balanceContentSid),
    created_at: new Date().toISOString(),
  });
  if (!claimed)
    return {
      id,
      status: 'duplicate',
      message:
        'This reminder was already attempted today. Check its history before sending again.',
    };
  try {
    await appendAuditLog(request, session, 'reminder_attempt', {
      id,
      loan_id: loanId,
      channel,
      kind,
      source,
    });
  } catch {
    await finishReminder(id, {
      status: 'blocked',
      error: 'Audit log unavailable; no message submitted',
    });
    throw new Error('Audit log unavailable; no message submitted');
  }
  const body = new URLSearchParams({
    To: (channel === 'whatsapp' ? 'whatsapp:' : '') + ready.phone,
    From:
      channel === 'whatsapp'
        ? 'whatsapp:' + ready.settings.whatsappFrom
        : ready.settings.smsFrom,
  });
  if (channel === 'sms') body.set('Body', ready.message);
  else {
    body.set(
      'ContentSid',
      kind === 'due'
        ? ready.settings.dueContentSid
        : ready.settings.balanceContentSid,
    );
    body.set(
      'ContentVariables',
      JSON.stringify({
        '1': ready.variables.customer,
        '2': ready.variables.loan_id,
        '3': ready.variables.balance,
        '4': ready.variables.due_date,
        '5': ready.variables.business_name,
      }),
    );
  }
  let status = 'unknown',
    provider_sid: string | undefined,
    error: string | undefined;
  try {
    const response = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' +
        ready.settings.accountSid +
        '/Messages.json',
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(ready.settings.accountSid + ':' + token).toString(
              'base64',
            ),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(12000),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      status = 'failed';
      error =
        'Twilio rejected request (code ' +
        String(result.code || response.status) +
        '). Check sender, template approval and recipient eligibility in Twilio.';
    } else {
      provider_sid = result.sid;
      status = result.status || 'accepted';
    }
  } catch {
    error =
      'Provider response uncertain. Check Twilio before retrying; this reminder will not be sent again automatically today.';
  }
  await finishReminder(id, { status, provider_sid, error });
  await appendAuditLog(request, session, 'reminder_result', {
    id,
    loan_id: loanId,
    channel,
    kind,
    status,
    provider_sid: provider_sid || null,
  });
  return { id, status, error };
}
export async function refreshReminderStatus(id: string, session: AppSession) {
  const store = await readReminders(
    session.role === 'agent' ? session.id : undefined,
  );
  const event = store.events.find((row) => row.id === id);
  if (!event) throw new Error('Reminder not found in recent history');
  if (session.role !== 'admin' && event.actor_id !== session.id)
    throw new AuthError('Not your reminder', 403);
  if (!event.provider_sid) return { status: event.status };
  const result = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' +
      store.settings.accountSid +
      '/Messages/' +
      encodeURIComponent(event.provider_sid) +
      '.json',
    {
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            store.settings.accountSid +
              ':' +
              decryptToken(store.settings.tokenEncrypted),
          ).toString('base64'),
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    },
  );
  if (!result.ok) throw new Error('Unable to retrieve provider status');
  const value = await result.json();
  await finishReminder(id, {
    status: value.status,
    error: value.error_code ? 'Twilio error ' + value.error_code : undefined,
  });
  return { status: value.status };
}
