export type ReminderChannel = 'sms' | 'whatsapp';
export type ReminderKind = 'due' | 'balance';
export type ReminderSettings = {
  accountSid: string;
  tokenEncrypted: string;
  smsFrom: string;
  whatsappFrom: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  automatic: boolean;
  agentCanSend: boolean;
  offsets: number[];
  automaticKinds: ReminderKind[];
  businessName: string;
  dueTemplate: string;
  balanceTemplate: string;
  dueContentSid: string;
  balanceContentSid: string;
};
export const defaultReminderSettings: ReminderSettings = {
  accountSid: '',
  tokenEncrypted: '',
  smsFrom: '',
  whatsappFrom: '',
  smsEnabled: false,
  whatsappEnabled: false,
  automatic: false,
  agentCanSend: true,
  offsets: [3, 2, 0],
  automaticKinds: ['due'],
  businessName: 'RMV Finance',
  dueTemplate:
    'Hello {customer}, loan {loan_id} is due on {due_date}. Outstanding balance: INR {balance}. Please contact {business_name} for your repayment amount.',
  balanceTemplate:
    'Hello {customer}, your outstanding balance for loan {loan_id} is INR {balance}. Next due date: {due_date}. — {business_name}',
  dueContentSid: '',
  balanceContentSid: '',
};
export type ReminderConsent = {
  customer_id: string;
  phone: string;
  sms: boolean;
  whatsapp: boolean;
  reason: string;
  updated_at: string;
};
export type ReminderEvent = {
  id: string;
  loan_id: string;
  customer_id: string;
  actor_id: string;
  actor_name: string;
  channel: ReminderChannel;
  kind: ReminderKind;
  source: 'manual' | 'automatic';
  status: string;
  message: string;
  provider_sid?: string;
  error?: string;
  created_at: string;
};
export type ReminderStore = {
  settings: ReminderSettings;
  consents: ReminderConsent[];
  events: ReminderEvent[];
};
export function renderReminder(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(
    /\{([a-z_]+)\}/g,
    (_, key) => variables[key] ?? '{' + key + '}',
  );
}
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function daysUntil(due: string, today = indiaDate()) {
  return Math.round(
    (Date.parse(due.slice(0, 10) + 'T00:00:00Z') -
      Date.parse(today + 'T00:00:00Z')) /
      86400000,
  );
}
export function normalizePhone(phone: string) {
  const value = phone.replace(/[\s()-]/g, '');
  return /^\d{10}$/.test(value) ? '+91' + value : value;
}
