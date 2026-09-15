import { verifyPlainCredential } from '@/lib/auth';
import { readReminders } from '@/lib/reminder-store';
import { scopeReminders, sendReminder } from '@/lib/reminders';
import { daysUntil } from '@/lib/reminder-types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    !verifyPlainCredential(
      request.headers.get('authorization') || '',
      'Bearer ' + process.env.CRON_SECRET,
    )
  )
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const store = await readReminders();
    if (!store.settings.automatic) return Response.json({ disabled: true });
    const session = {
      id: 'system-reminders',
      name: 'Automatic reminder scheduler',
      role: 'admin' as const,
      exp: Date.now() + 300000,
    };
    const scope = await scopeReminders(session);
    const tasks = scope.loans
      .filter((loan) =>
        store.settings.offsets.includes(daysUntil(loan.next_due_date)),
      )
      .flatMap((loan) =>
        store.settings.automaticKinds.flatMap((kind) =>
          (['sms', 'whatsapp'] as const)
            .filter((channel) =>
              channel === 'sms'
                ? store.settings.smsEnabled
                : store.settings.whatsappEnabled,
            )
            .map((channel) => ({ loan, kind, channel })),
        ),
      );
    const start = Date.now();
    let cursor = 0;
    const counts: Record<string, number> = {};
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        while (cursor < tasks.length && Date.now() - start < 240000) {
          const task = tasks[cursor++];
          try {
            const result = await sendReminder(
              request,
              session,
              task.loan.id,
              task.channel,
              task.kind,
              'automatic',
            );
            counts[result.status] = (counts[result.status] || 0) + 1;
          } catch {
            counts.skipped_or_failed = (counts.skipped_or_failed || 0) + 1;
          }
        }
      }),
    );
    return Response.json(
      {
        counts,
        total: tasks.length,
        processed: cursor,
        remaining: tasks.length - cursor,
      },
      { status: cursor < tasks.length ? 503 : 200 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Scheduled reminders failed',
      },
      { status: 500 },
    );
  }
}
