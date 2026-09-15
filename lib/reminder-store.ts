import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getSupabaseAdmin, hasSupabaseConfig } from './supabase-admin';
import {
  mutateLocalStore,
  readLocalStore,
  type StoredLoan,
  type StoredUser,
} from './local-data-store';
import {
  defaultReminderSettings,
  type ReminderStore,
  type ReminderEvent,
  type ReminderSettings,
  type ReminderConsent,
} from './reminder-types';
function encryptionKey() {
  const value = process.env.FUNDFLOW_NOTIFICATION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value))
    throw new Error(
      'Set FUNDFLOW_NOTIFICATION_KEY to a 64-character hex encryption key on the server',
    );
  return Buffer.from(value, 'hex');
}
export function encryptToken(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return [
    iv.toString('hex'),
    cipher.update(value, 'utf8', 'hex') + cipher.final('hex'),
    cipher.getAuthTag().toString('hex'),
  ].join('.');
}
export function decryptToken(value: string) {
  const [iv, data, tag] = value.split('.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}
function init(data: { reminders?: ReminderStore }) {
  return (data.reminders ??= {
    settings: structuredClone(defaultReminderSettings),
    consents: [],
    events: [],
  });
}
export async function readReminders(actorId?: string): Promise<ReminderStore> {
  if (!hasSupabaseConfig()) {
    if (process.env.VERCEL)
      throw new Error('Configure Supabase for reminders on Vercel');
    return init(await readLocalStore());
  }
  const db = getSupabaseAdmin();
  async function allConsents() {
    const all: ReminderConsent[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await db
        .from('reminder_consents')
        .select('*')
        .order('customer_id')
        .range(offset, offset + 499);
      if (result.error) return { data: all, error: result.error };
      all.push(...result.data);
      if (result.data.length < 500) return { data: all, error: null };
    }
  }
  let history = db.from('reminder_events').select('*');
  if (actorId) history = history.eq('actor_id', actorId);
  const [settings, consents, events] = await Promise.all([
    db
      .from('reminder_settings')
      .select('value')
      .eq('id', 'default')
      .maybeSingle(),
    allConsents(),
    history.order('created_at', { ascending: false }).limit(500),
  ]);
  for (const result of [settings, consents, events])
    if (result.error)
      throw new Error(
        'Reminder database unavailable. Apply supabase/reminders-migration.sql. ' +
          result.error.message,
      );
  return {
    settings: { ...defaultReminderSettings, ...settings.data?.value },
    consents: consents.data || [],
    events: events.data || [],
  };
}
export async function saveReminderSettings(settings: ReminderSettings) {
  if (!hasSupabaseConfig())
    return mutateLocalStore((data) => {
      init(data).settings = settings;
    });
  const result = await getSupabaseAdmin()
    .from('reminder_settings')
    .upsert({ id: 'default', value: settings });
  if (result.error) throw result.error;
}
export async function saveReminderConsent(consent: ReminderConsent) {
  if (!hasSupabaseConfig())
    return mutateLocalStore((data) => {
      const store = init(data);
      store.consents = store.consents.filter(
        (row) => row.customer_id !== consent.customer_id,
      );
      store.consents.push(consent);
    });
  const result = await getSupabaseAdmin()
    .from('reminder_consents')
    .upsert(consent);
  if (result.error) throw result.error;
}
// Claim before contacting the provider: ambiguous timeouts must not cause duplicate sends.
export async function claimReminder(event: ReminderEvent) {
  if (!hasSupabaseConfig())
    return mutateLocalStore((data) => {
      const store = init(data);
      if (store.events.some((row) => row.id === event.id)) return false;
      store.events.unshift(event);
      return true;
    });
  const result = await getSupabaseAdmin().from('reminder_events').insert(event);
  if (result.error?.code === '23505') return false;
  if (result.error) throw result.error;
  return true;
}
export async function finishReminder(
  id: string,
  update: Partial<ReminderEvent>,
) {
  if (!hasSupabaseConfig())
    return mutateLocalStore((data) => {
      const row = init(data).events.find((row) => row.id === id);
      if (row) Object.assign(row, update);
    });
  const result = await getSupabaseAdmin()
    .from('reminder_events')
    .update(update)
    .eq('id', id);
  if (result.error) throw result.error;
}
export async function reminderFinance(): Promise<{
  users: StoredUser[];
  loans: StoredLoan[];
}> {
  if (!hasSupabaseConfig()) {
    const data = await readLocalStore();
    return { users: data.users, loans: data.loans };
  }
  const db = getSupabaseAdmin();
  async function rows(table: string) {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await db
        .from(table)
        .select('*')
        .order('id')
        .range(offset, offset + 499);
      if (result.error) throw result.error;
      all.push(...result.data);
      if (result.data.length < 500) return all;
    }
  }
  const [users, loans] = await Promise.all([rows('users'), rows('loans')]);
  return { users, loans } as unknown as {
    users: StoredUser[];
    loans: StoredLoan[];
  };
}
