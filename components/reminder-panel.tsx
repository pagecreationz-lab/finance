'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  daysUntil,
  normalizePhone,
  type ReminderSettings,
  type ReminderEvent,
  type ReminderConsent,
} from '@/lib/reminder-types';
type Settings = Omit<ReminderSettings, 'tokenEncrypted'> & {
  tokenConfigured?: boolean;
};
type Snapshot = {
  role: 'admin' | 'agent';
  settings: Settings;
  customers: { id: string; name: string; phone: string }[];
  loans: {
    id: string;
    customer_id: string;
    balance: number;
    next_due_date: string;
  }[];
  consents: ReminderConsent[];
  events: ReminderEvent[];
};
async function api(body?: Record<string, unknown>) {
  const response = await fetch('/api/reminders', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Reminder request failed');
  return data;
}
const selectClass = 'h-10 w-full rounded-lg border bg-white px-3 text-sm';
function Label({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#365348]">
      {title}
      {children}
    </label>
  );
}
export function ReminderPanel({
  initialChannel = 'sms',
}: {
  initialChannel?: 'sms' | 'whatsapp';
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const [loanId, setLoanId] = useState(''),
    [channel, setChannel] = useState<'sms' | 'whatsapp'>(initialChannel),
    [kind, setKind] = useState<'due' | 'balance'>('due'),
    [day, setDay] = useState('all');
  const [preview, setPreview] = useState<{
      message: string;
      phone: string;
      consented: boolean;
      variables: Record<string, string>;
      contentSid: string;
    } | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [customerId, setCustomerId] = useState(''),
    [smsConsent, setSmsConsent] = useState(false),
    [waConsent, setWaConsent] = useState(false),
    [reason, setReason] = useState('');
  async function load() {
    const value = await api();
    setData(value);
    setSettings(value.role === 'admin' ? value.settings : null);
  }
  useEffect(() => {
    let current = true;
    api()
      .then((value) => {
        if (current) {
          setData(value);
          setSettings(value.role === 'admin' ? value.settings : null);
        }
      })
      .catch((error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, []);
  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
  }
  function chooseCustomer(value: string) {
    setCustomerId(value);
    const customer = data?.customers.find((row) => row.id === value);
    const consent = data?.consents.find(
      (row) =>
        row.customer_id === value &&
        row.phone === normalizePhone(customer?.phone || ''),
    );
    setSmsConsent(consent?.sms || false);
    setWaConsent(consent?.whatsapp || false);
    setReason('');
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : null));
  }
  const customers = new Map(data?.customers.map((row) => [row.id, row]));
  return (
    <div className="space-y-6 text-[#163b2e]">
      <div>
        <h1 className="text-3xl font-bold">SMS & WhatsApp reminders</h1>
        <p className="mt-2 text-sm text-[#6c8078]">
          Due-date and outstanding-balance notifications. Agents can send only
          for assigned customers.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <output className="block rounded-xl bg-green-50 p-4 text-sm">
          {notice}
        </output>
      )}
      {!data ? (
        <Button disabled={busy} onClick={() => run(load)}>
          Load reminder configuration
        </Button>
      ) : (
        <>
          {settings && (
            <details className="rounded-2xl border bg-white p-5" open>
              <summary className="cursor-pointer text-lg font-semibold">
                Super admin · Provider & automatic reminders
              </summary>
              <div className="mt-5 space-y-5">
                <p className="text-sm text-[#6c8078]">
                  Twilio credentials stay on the server. SMS requires an
                  approved sender. WhatsApp requires recipient opt-in and
                  approved templates. Saving does not send a test message.
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Label title="Business name">
                    <Input
                      value={settings.businessName}
                      onChange={(e) => update('businessName', e.target.value)}
                    />
                  </Label>
                  <Label title="Twilio Account SID (AC…)">
                    <Input
                      autoComplete="off"
                      value={settings.accountSid}
                      onChange={(e) => update('accountSid', e.target.value)}
                    />
                  </Label>
                  <Label
                    title={
                      'Auth token' +
                      (settings.tokenConfigured
                        ? ' · saved; leave blank to keep'
                        : ' · required')
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </Label>
                  <Label title="SMS sender (number or approved sender ID)">
                    <Input
                      value={settings.smsFrom}
                      onChange={(e) => update('smsFrom', e.target.value)}
                      placeholder="+12345678900"
                    />
                  </Label>
                  <Label title="WhatsApp sender (international number)">
                    <Input
                      value={settings.whatsappFrom}
                      onChange={(e) => update('whatsappFrom', e.target.value)}
                      placeholder="+12345678900"
                    />
                  </Label>
                </div>
                <div className="flex flex-wrap gap-5">
                  {(
                    [
                      'smsEnabled',
                      'whatsappEnabled',
                      'agentCanSend',
                      'automatic',
                    ] as const
                  ).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) => update(key, e.target.checked)}
                      />
                      {
                        {
                          smsEnabled: 'Enable SMS',
                          whatsappEnabled: 'Enable WhatsApp',
                          agentCanSend: 'Allow agents to send',
                          automatic: 'Enable automatic reminders',
                        }[key]
                      }
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Automatic reminder days
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {[3, 2, 0].map((offset) => (
                        <label
                          key={offset}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={settings.offsets.includes(offset)}
                            onChange={(e) =>
                              update(
                                'offsets',
                                e.target.checked
                                  ? [...settings.offsets, offset]
                                  : settings.offsets.filter(
                                      (n) => n !== offset,
                                    ),
                              )
                            }
                          />
                          {offset === 0
                            ? 'On due date'
                            : offset + ' days before'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Automatic message types
                    </p>
                    <div className="flex gap-4">
                      {(['due', 'balance'] as const).map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={settings.automaticKinds.includes(value)}
                            onChange={(e) =>
                              update(
                                'automaticKinds',
                                e.target.checked
                                  ? [...settings.automaticKinds, value]
                                  : settings.automaticKinds.filter(
                                      (n) => n !== value,
                                    ),
                              )
                            }
                          />
                          {value === 'due' ? 'Due date' : 'Balance'}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#6c8078]">
                  Daily scheduler: 09:00 India time (Vercel Hobby may invoke
                  within the following hour). Closed, foreclosed, zero-balance
                  and non-consenting accounts are excluded. Selecting both
                  message types sends two messages per channel.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Label title="Due-date SMS message">
                    <Textarea
                      rows={4}
                      value={settings.dueTemplate}
                      onChange={(e) => update('dueTemplate', e.target.value)}
                    />
                  </Label>
                  <Label title="Balance SMS message">
                    <Textarea
                      rows={4}
                      value={settings.balanceTemplate}
                      onChange={(e) =>
                        update('balanceTemplate', e.target.value)
                      }
                    />
                  </Label>
                  <Label title="WhatsApp due-date Content SID (HX…)">
                    <Input
                      value={settings.dueContentSid}
                      onChange={(e) => update('dueContentSid', e.target.value)}
                    />
                  </Label>
                  <Label title="WhatsApp balance Content SID (HX…)">
                    <Input
                      value={settings.balanceContentSid}
                      onChange={(e) =>
                        update('balanceContentSid', e.target.value)
                      }
                    />
                  </Label>
                </div>
                <p className="text-xs leading-6">
                  SMS placeholders:{' '}
                  {
                    '{customer}, {loan_id}, {balance}, {due_date}, {business_name}, {days_left}'
                  }
                  . WhatsApp text must be customized and approved in Twilio;
                  these SMS text boxes do not change WhatsApp templates. Map
                  WhatsApp variables: 1 = customer, 2 = loan ID, 3 = balance, 4
                  = due date, 5 = business name.
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api({
                        action: 'settings',
                        settings,
                        authToken: token,
                      });
                      setToken('');
                      await load();
                      setNotice(
                        'Reminder configuration saved. Automatic sends require the deployed scheduler and customer consent.',
                      );
                    })
                  }
                >
                  {busy ? 'Please wait…' : 'Save reminder configuration'}
                </Button>
              </div>
            </details>
          )}
          {settings && (
            <details className="rounded-2xl border bg-white p-5">
              <summary className="cursor-pointer text-lg font-semibold">
                Customer consent & opt-out
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Label title="Customer">
                  <select
                    disabled={busy}
                    className={selectClass}
                    value={customerId}
                    onChange={(e) => chooseCustomer(e.target.value)}
                  >
                    <option value="">Choose customer</option>
                    {data.customers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.phone}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label title="Consent source/date or withdrawal reason">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Written consent received on…"
                  />
                </Label>
                <div className="flex flex-wrap items-center gap-4">
                  <label>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                    />{' '}
                    SMS consent
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={waConsent}
                      onChange={(e) => setWaConsent(e.target.checked)}
                    />{' '}
                    WhatsApp opt-in
                  </label>
                </div>
                <Button
                  disabled={busy || !customerId || reason.trim().length < 3}
                  onClick={() =>
                    run(async () => {
                      await api({
                        action: 'consent',
                        customer_id: customerId,
                        sms: smsConsent,
                        whatsapp: waConsent,
                        reason,
                      });
                      await load();
                      setNotice(
                        'Customer channel preferences saved for the current mobile number.',
                      );
                    })
                  }
                >
                  Save consent / withdrawal
                </Button>
                <p className="text-xs md:col-span-2">
                  Record actual consent only. Untick a channel to stop sends.
                  Changing the customer phone number requires new consent.
                  Handle opt-out requests promptly here.
                </p>
              </div>
            </details>
          )}
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Send a manual reminder</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Label title="Filter due date">
                <select
                  disabled={busy}
                  className={selectClass}
                  value={day}
                  onChange={(e) => {
                    resetPreview();
                    setDay(e.target.value);
                    setLoanId('');
                  }}
                >
                  <option value="all">All open loans</option>
                  <option value="3">Due in 3 days</option>
                  <option value="2">Due in 2 days</option>
                  <option value="0">Due today</option>
                </select>
              </Label>
              <Label title="Customer / loan">
                <select
                  disabled={busy}
                  className={selectClass}
                  value={loanId}
                  onChange={(e) => {
                    resetPreview();
                    setLoanId(e.target.value);
                  }}
                >
                  <option value="">Choose loan</option>
                  {data.loans
                    .filter(
                      (row) =>
                        day === 'all' ||
                        daysUntil(row.next_due_date) === Number(day),
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {customers.get(row.customer_id)?.name} · {row.id} · INR{' '}
                        {row.balance.toLocaleString('en-IN')}
                      </option>
                    ))}
                </select>
              </Label>
              <Label title="Channel">
                <select
                  disabled={busy}
                  className={selectClass}
                  value={channel}
                  onChange={(e) => (
                    resetPreview(),
                    setChannel(e.target.value as 'sms' | 'whatsapp')
                  )}
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </Label>
              <Label title="Message type">
                <select
                  disabled={busy}
                  className={selectClass}
                  value={kind}
                  onChange={(e) => {
                    resetPreview();
                    setKind(e.target.value as 'due' | 'balance');
                  }}
                >
                  <option value="due">Loan due date</option>
                  <option value="balance">Outstanding balance</option>
                </select>
              </Label>
            </div>
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy || !loanId}
              onClick={() =>
                run(async () => {
                  setPreview(
                    await api({
                      action: 'preview',
                      loan_id: loanId,
                      channel,
                      kind,
                    }),
                  );
                  setConfirmed(false);
                })
              }
            >
              Preview recipient & message
            </Button>
            {preview && (
              <div className="mt-4 space-y-3 rounded-xl bg-[#f2f7f4] p-4 text-sm">
                <p>Recipient: {preview.phone}</p>
                {channel === 'sms' ? (
                  <p className="whitespace-pre-wrap">{preview.message}</p>
                ) : (
                  <>
                    <p>
                      Approved WhatsApp template:{' '}
                      {preview.contentSid || 'Not configured'}
                    </p>
                    <p>
                      Template values:{' '}
                      {Object.entries(preview.variables)
                        .filter(([key]) => key !== 'days_left')
                        .map(([key, value]) => key + ': ' + value)
                        .join(' · ')}
                    </p>
                    <p>
                      Review the approved text in Twilio. The template—not the
                      SMS preview—is sent.
                    </p>
                  </>
                )}
                {!preview.consented ? (
                  <p className="text-red-700">
                    Consent for this channel is missing. Ask the super admin to
                    record it.
                  </p>
                ) : (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />{' '}
                      I checked the recipient and want to send this message
                      (provider charges may apply).
                    </label>
                    <Button
                      disabled={busy || !confirmed}
                      onClick={() =>
                        run(async () => {
                          const result = await api({
                            action: 'send',
                            loan_id: loanId,
                            channel,
                            kind,
                            confirm: true,
                          });
                          setNotice(
                            result.status === 'duplicate'
                              ? result.message
                              : 'Provider status: ' +
                                  result.status +
                                  (result.error
                                    ? ' — ' + result.error
                                    : '. Submission does not guarantee delivery.'),
                          );
                          setConfirmed(false);
                          setPreview(null);
                          await load();
                        })
                      }
                    >
                      {busy ? 'Submitting…' : 'Send reminder'}
                    </Button>
                  </>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-[#6c8078]">
              One attempt per loan, due date, message type and channel per day,
              shared between admin, agents and automation. A provider timeout is
              marked unknown and is not retried automatically.
            </p>
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent reminder history</h2>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(load)}
              >
                Refresh list
              </Button>
            </div>
            <p className="my-3 text-xs">
              Most recent 100 attempts. Permanent action records are in Logs.
              Use “Check delivery” to retrieve the latest Twilio status.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr>
                    {[
                      'Date',
                      'Loan / sender',
                      'Channel / type',
                      'Status',
                      'Provider',
                    ].map((title) => (
                      <th className="p-3" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((row) => (
                    <tr className="border-t" key={row.id}>
                      <td className="p-3">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        {row.loan_id}
                        <br />
                        <span className="text-xs">
                          {row.actor_name} · {row.source}
                        </span>
                      </td>
                      <td className="p-3">
                        {row.channel} / {row.kind}
                      </td>
                      <td className="max-w-xs p-3">
                        {row.status}
                        {row.error && (
                          <p className="mt-1 text-xs text-red-700">
                            {row.error}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        {row.provider_sid ? (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api({ action: 'refresh', id: row.id });
                                await load();
                              })
                            }
                          >
                            Check delivery
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.events.length && (
                <p className="py-5 text-sm">No reminder attempts yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
