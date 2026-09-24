// Run: node tests/reminders.cjs. No network traffic and no real finance-data changes.
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  Module = require('node:module'),
  ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fundflow-reminders-test-'));
process.env.FUNDFLOW_LOCAL_DATA_PATH = path.join(temp, 'finance.json');
process.env.FUNDFLOW_NOTIFICATION_KEY = 'ab'.repeat(32);
process.env.FUNDFLOW_SESSION_SECRET = 'isolated-test-secret';
process.env.CRON_SECRET = 'isolated-cron-secret';
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL',
])
  delete process.env[key];
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(
    this,
    name.startsWith('@/') ? path.join(root, name.slice(2)) : name,
    ...args,
  );
};
Module._extensions['.ts'] = function (mod, file) {
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
};
const types = require('../lib/reminder-types.ts'),
  storage = require('../lib/reminder-store.ts'),
  local = require('../lib/local-data-store.ts'),
  auth = require('../lib/auth.ts');
const route = require('../app/api/reminders/route.ts'),
  cron = require('../app/api/cron/reminders/route.ts');
const admin = { id: 'test-admin', name: 'Test Admin', role: 'admin' },
  agent = { id: 'agent-deepak', name: 'Deepak', role: 'agent' };
const req = (body, session = admin) =>
  new Request('http://localhost/api/reminders', {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: session
        ? auth
            .createSessionCookie(session, new Request('http://localhost'))
            .split(';')[0]
        : '',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
async function post(body, session = admin, status = 200) {
  const result = await route.POST(req(body, session));
  const value = await result.json();
  assert.equal(result.status, status, JSON.stringify(value));
  return value;
}
let calls = [],
  mode = 'ok';
global.fetch = async (url, options = {}) => {
  assert.ok(String(url).startsWith('https://api.twilio.com/'));
  if (!options.method) return Response.json({ status: 'delivered' });
  calls.push(new URLSearchParams(options.body));
  if (mode === 'timeout') throw new Error('fake network timeout');
  if (mode === 'failure')
    return Response.json({ code: 21608 }, { status: 400 });
  return Response.json(
    { sid: 'SM' + 'a'.repeat(32), status: 'queued' },
    { status: 201 },
  );
};
(async () => {
  assert.equal((await route.GET(req(undefined, null))).status, 401);
  assert.equal(
    (await cron.GET(new Request('http://localhost/api/cron/reminders'))).status,
    401,
  );
  assert.equal(types.indiaDate(new Date('2026-09-14T20:00:00Z')), '2026-09-15');
  assert.equal(types.daysUntil('2026-10-01', '2026-09-28'), 3);
  assert.equal(types.daysUntil('2028-03-01', '2028-02-28'), 2);
  let settings = {
    ...types.defaultReminderSettings,
    accountSid: 'AC' + '1'.repeat(32),
    smsFrom: '+15005550006',
    whatsappFrom: '+15005550006',
    dueContentSid: 'HX' + '2'.repeat(32),
    balanceContentSid: 'HX' + '3'.repeat(32),
    smsEnabled: true,
    whatsappEnabled: true,
  };
  await post(
    { action: 'settings', settings, authToken: 'fake-token-only-for-tests' },
    agent,
    403,
  );
  await post({
    action: 'settings',
    settings,
    authToken: 'fake-token-only-for-tests',
  });
  let response = await (await route.GET(req())).json();
  assert.ok(response.settings.tokenConfigured);
  assert.equal(response.settings.tokenEncrypted, undefined);
  assert.equal(response.settings.authToken, undefined);
  const stored = await storage.readReminders();
  assert.notEqual(stored.settings.tokenEncrypted, 'fake-token-only-for-tests');
  assert.equal(
    storage.decryptToken(stored.settings.tokenEncrypted),
    'fake-token-only-for-tests',
  );
  const agentData = await (await route.GET(req(undefined, agent))).json();
  assert.equal(agentData.customers.length, 2);
  assert.equal(agentData.settings.accountSid, undefined);
  assert.equal(agentData.settings.tokenEncrypted, undefined);
  await post(
    { action: 'preview', loan_id: 'LN-2047', channel: 'sms', kind: 'due' },
    agent,
    403,
  );
  await post(
    {
      action: 'send',
      loan_id: 'LN-2048',
      channel: 'sms',
      kind: 'due',
      confirm: true,
    },
    admin,
    400,
  );
  assert.equal(calls.length, 0);
  await post(
    {
      action: 'consent',
      customer_id: 'customer-arjun',
      sms: true,
      whatsapp: true,
      reason: 'Test fixture consent',
    },
    agent,
    403,
  );
  await post({
    action: 'consent',
    customer_id: 'customer-arjun',
    sms: true,
    whatsapp: true,
    reason: 'Test fixture consent',
  });
  await local.mutateLocalStore((data) => {
    data.users.find((row) => row.id === 'customer-arjun').name =
      'Renamed Customer';
  });
  const preview = await post(
    { action: 'preview', loan_id: 'LN-2048', channel: 'sms', kind: 'due' },
    agent,
  );
  assert.ok(preview.message.includes('Renamed Customer'));
  assert.ok(preview.message.includes('1,82,400'));
  const results = await Promise.all([
    post(
      {
        action: 'send',
        loan_id: 'LN-2048',
        channel: 'sms',
        kind: 'due',
        confirm: true,
      },
      agent,
    ),
    post(
      {
        action: 'send',
        loan_id: 'LN-2048',
        channel: 'sms',
        kind: 'due',
        confirm: true,
      },
      admin,
    ),
  ]);
  assert.equal(calls.length, 1);
  assert.ok(results.some((row) => row.status === 'duplicate'));
  assert.ok(results.some((row) => row.status === 'queued'));
  assert.ok(calls[0].get('Body').includes('Renamed Customer'));
  const wa = await post(
    {
      action: 'send',
      loan_id: 'LN-2048',
      channel: 'whatsapp',
      kind: 'due',
      confirm: true,
    },
    agent,
  );
  assert.equal(wa.status, 'queued');
  assert.equal(calls[1].get('Body'), null);
  assert.equal(
    JSON.parse(calls[1].get('ContentVariables'))['1'],
    'Renamed Customer',
  );
  assert.ok(calls[1].get('To').startsWith('whatsapp:+91'));
  assert.equal(
    (await post({ action: 'refresh', id: wa.id }, agent)).status,
    'delivered',
  );
  mode = 'failure';
  assert.equal(
    (
      await post({
        action: 'send',
        loan_id: 'LN-2048',
        channel: 'sms',
        kind: 'balance',
        confirm: true,
      })
    ).status,
    'failed',
  );
  mode = 'timeout';
  assert.equal(
    (
      await post({
        action: 'send',
        loan_id: 'LN-2048',
        channel: 'whatsapp',
        kind: 'balance',
        confirm: true,
      })
    ).status,
    'unknown',
  );
  mode = 'ok';
  await post({
    action: 'settings',
    settings: { ...settings, agentCanSend: false },
  });
  await post(
    { action: 'preview', loan_id: 'LN-2048', channel: 'sms', kind: 'due' },
    agent,
    403,
  );
  await post({
    action: 'settings',
    settings: { ...settings, agentCanSend: true },
  });
  await local.mutateLocalStore((data) => {
    data.users.find((row) => row.id === 'customer-arjun').phone =
      '+919999999999';
  });
  const changed = await post({
    action: 'preview',
    loan_id: 'LN-2048',
    channel: 'sms',
    kind: 'due',
  });
  assert.equal(changed.consented, false);
  await post(
    {
      action: 'send',
      loan_id: 'LN-2048',
      channel: 'sms',
      kind: 'due',
      confirm: true,
    },
    admin,
    400,
  );
  await local.mutateLocalStore((data) => {
    data.loans.find((row) => row.id === 'LN-2048').status = 'foreclosed';
  });
  await post(
    { action: 'preview', loan_id: 'LN-2048', channel: 'sms', kind: 'due' },
    admin,
    403,
  );
  await local.mutateLocalStore((data) => {
    data.users.find((row) => row.id === 'agent-deepak').role = 'archived_agent';
  });
  assert.equal((await route.GET(req(undefined, agent))).status, 401);
  // Separate fresh loans exercise 3-day, 2-day and due-day automation without old claims.
  await local.mutateLocalStore((data) => {
    const sample = data.loans[1];
    data.loans = [];
    const today = types.indiaDate();
    for (const offset of [3, 2, 0, 1, -1]) {
      const date = new Date(today + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + offset);
      data.loans.push({
        ...sample,
        id: 'AUTO-' + offset,
        balance: 100,
        status: 'active',
        next_due_date: date.toISOString().slice(0, 10),
      });
    }
  });
  await post({
    action: 'consent',
    customer_id: 'customer-priya',
    sms: true,
    whatsapp: true,
    reason: 'Test fixture consent',
  });
  await post({
    action: 'settings',
    settings: { ...settings, automatic: true },
  });
  const cronReq = () =>
    new Request('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
    });
  let count = calls.length;
  const scheduled = await (await cron.GET(cronReq())).json();
  assert.equal(scheduled.total, 6);
  assert.equal(calls.length - count, 6);
  assert.equal(scheduled.counts.queued, 6);
  const repeated = await (await cron.GET(cronReq())).json();
  assert.equal(repeated.counts.duplicate, 6);
  assert.equal(calls.length - count, 6);
  const all = await local.readLocalStore();
  assert.ok(all.audit_logs.some((row) => row.action === 'reminder_result'));
  assert.ok(
    !JSON.stringify(all.audit_logs).includes('fake-token-only-for-tests'),
  );
  await assert.rejects(
    () =>
      local.mutateLocalStore((data) => {
        data.audit_logs[0].summary = 'edited';
      }),
    /cannot be edited/,
  );
  console.log(
    'PASS: authentication, permissions, encryption, consent, live names/balances, SMS/WhatsApp payloads, concurrent deduplication, delivery refresh, provider failure/timeout, closed loans, archived agents, 3/2/0 scheduling, repeat cron and immutable audit logs. No real messages sent.',
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    const resolved = path.resolve(temp);
    if (
      path.dirname(resolved) === path.resolve(os.tmpdir()) &&
      path.basename(resolved).startsWith('fundflow-reminders-test-')
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  });
