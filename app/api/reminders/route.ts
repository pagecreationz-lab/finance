import { access, requirePermission } from '@/lib/rbac';
import { AuthError, requireAdmin, requireSession } from '@/lib/auth';
import { appendAuditLog } from '@/lib/audit-log';
import {
  encryptToken,
  readReminders,
  saveReminderSettings,
  saveReminderConsent,
} from '@/lib/reminder-store';
import {
  prepareReminder,
  providerReady,
  refreshReminderStatus,
  scopeReminders,
  sendReminder,
} from '@/lib/reminders';
import {
  normalizePhone,
  type ReminderSettings,
  type ReminderKind,
} from '@/lib/reminder-types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (error: unknown) =>
  Response.json(
    {
      error: error instanceof Error ? error.message : 'Reminder request failed',
    },
    { status: error instanceof AuthError ? error.status : 400 },
  );
export async function GET(request: Request) {
  try {
    const {session,permissions} = await access(request);requirePermission(permissions,'reminders');
    const [scope, store] = await Promise.all([
      scopeReminders(session),
      readReminders(session.role === 'agent' ? session.id : undefined),
    ]);
    const { tokenEncrypted, ...settings } = store.settings;
    return Response.json(
      {
        role: session.role,
        settings:
          session.role === 'admin'
            ? { ...settings, tokenConfigured: Boolean(tokenEncrypted) }
            : {
                agentCanSend: settings.agentCanSend,
                smsEnabled: settings.smsEnabled,
                whatsappEnabled: settings.whatsappEnabled,
              },
        customers: scope.customers.map(({ id, name, phone }) => ({
          id,
          name,
          phone,
        })),
        loans: scope.loans.map(
          ({ id, customer_id, balance, next_due_date }) => ({
            id,
            customer_id,
            balance,
            next_due_date,
          }),
        ),
        consents: session.role === 'admin' ? store.consents : [],
        events: store.events
          .filter(
            (row) => session.role === 'admin' || row.actor_id === session.id,
          )
          .slice(0, 100),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new AuthError('Cross-origin requests are not permitted', 403);
    const {session,permissions} = await access(request);requirePermission(permissions,'reminders');
    await scopeReminders(session);
    const body = await request.json();
    if (body.action === 'settings') {
      requireAdmin(session);
      const store = await readReminders();
      const input = body.settings || {};
      const settings: ReminderSettings = { ...store.settings };
      for (const key of [
        'accountSid',
        'smsFrom',
        'whatsappFrom',
        'businessName',
        'dueTemplate',
        'balanceTemplate',
        'dueContentSid',
        'balanceContentSid',
      ] as const) {
        if (typeof input[key] !== 'string' || input[key].length > 1500)
          throw new Error('Invalid ' + key);
        settings[key] = input[key].trim();
      }
      for (const key of [
        'smsEnabled',
        'whatsappEnabled',
        'automatic',
        'agentCanSend',
      ] as const) {
        if (typeof input[key] !== 'boolean') throw new Error('Invalid ' + key);
        settings[key] = input[key];
      }
      if (
        !Array.isArray(input.offsets) ||
        input.offsets.some((n: unknown) => ![0, 2, 3].includes(n as number))
      )
        throw new Error('Choose 3 days, 2 days or due date');
      settings.offsets = [...new Set<number>(input.offsets)];
      if (
        !Array.isArray(input.automaticKinds) ||
        input.automaticKinds.some(
          (kind: unknown) => !['due', 'balance'].includes(kind as string),
        )
      )
        throw new Error('Invalid reminder type');
      settings.automaticKinds = [
        ...new Set<ReminderKind>(input.automaticKinds),
      ];
      if (
        !settings.businessName ||
        !settings.dueTemplate ||
        !settings.balanceTemplate
      )
        throw new Error('Business name and both SMS templates are required');
      for (const template of [settings.dueTemplate, settings.balanceTemplate])
        if (
          (template.match(/\{[^}]+\}/g) || []).some(
            (value) =>
              ![
                '{customer}',
                '{loan_id}',
                '{balance}',
                '{due_date}',
                '{business_name}',
                '{days_left}',
              ].includes(value),
          )
        )
          throw new Error('Unsupported message placeholder');
      if (body.authToken) {
        if (
          typeof body.authToken !== 'string' ||
          !/^\S{16,128}$/.test(body.authToken)
        )
          throw new Error('Invalid auth token');
        settings.tokenEncrypted = encryptToken(body.authToken);
      }
      if (
        settings.automatic &&
        (!settings.offsets.length ||
          !settings.automaticKinds.length ||
          (!settings.smsEnabled && !settings.whatsappEnabled))
      )
        throw new Error(
          'Automatic reminders need a channel, reminder type and reminder day',
        );
      for (const channel of ['sms', 'whatsapp'] as const)
        if (
          channel === 'sms' ? settings.smsEnabled : settings.whatsappEnabled
        ) {
          for (const kind of settings.automaticKinds.length
            ? settings.automaticKinds
            : ['due' as const])
            providerReady(settings, channel, kind);
        }
      await appendAuditLog(request, session, 'reminder_settings', {
        automatic: settings.automatic,
        offsets: settings.offsets,
      });
      await saveReminderSettings(settings);
      return Response.json({ ok: true });
    }
    if (body.action === 'consent') {
      requireAdmin(session);
      const scope = await scopeReminders(session);
      const customer = scope.customers.find(
        (row) => row.id === body.customer_id,
      );
      if (!customer) throw new Error('Customer not found');
      if (
        typeof body.sms !== 'boolean' ||
        typeof body.whatsapp !== 'boolean' ||
        typeof body.reason !== 'string' ||
        body.reason.trim().length < 3 ||
        body.reason.length > 500
      )
        throw new Error('Record the consent source or withdrawal reason');
      const phone = normalizePhone(customer.phone);
      if (!/^\+[1-9]\d{7,14}$/.test(phone))
        throw new Error('Correct the customer mobile number first');
      await appendAuditLog(request, session, 'reminder_consent', body);
      await saveReminderConsent({
        customer_id: customer.id,
        phone,
        sms: body.sms,
        whatsapp: body.whatsapp,
        reason: body.reason.trim(),
        updated_at: new Date().toISOString(),
      });
      return Response.json({ ok: true });
    }
    if (body.action === 'refresh')
      return Response.json(
        await refreshReminderStatus(String(body.id), session),
      );
    if (
      !['preview', 'send'].includes(body.action) ||
      !['sms', 'whatsapp'].includes(body.channel) ||
      !['due', 'balance'].includes(body.kind) ||
      typeof body.loan_id !== 'string'
    )
      throw new Error('Invalid reminder request');
    if (body.action === 'preview') {
      const ready = await prepareReminder(
        session,
        body.loan_id,
        body.channel,
        body.kind,
      );
      return Response.json({
        message: ready.message,
        phone: ready.phone,
        consented: ready.consented,
        variables: ready.variables,
        contentSid:
          body.kind === 'due'
            ? ready.settings.dueContentSid
            : ready.settings.balanceContentSid,
      });
    }
    if (body.confirm !== true)
      throw new Error('Confirm the recipient before sending');
    return Response.json(
      await sendReminder(
        request,
        session,
        body.loan_id,
        body.channel,
        body.kind,
        'manual',
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
