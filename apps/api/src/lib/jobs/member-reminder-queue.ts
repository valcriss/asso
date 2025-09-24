import { Queue } from 'bullmq';

export type MemberPaymentReminderTrigger = 'BEFORE_DUE' | 'AFTER_DUE';

export interface MemberPaymentReminderJob {
  organizationId: string;
  memberPaymentId: string;
  assignmentId: string;
  memberId: string;
  dueDate: string;
  trigger: MemberPaymentReminderTrigger;
}

export interface ScheduledMemberPaymentReminder {
  job: MemberPaymentReminderJob;
  runAt: Date;
}

export interface MemberReminderQueue {
  scheduleMemberPaymentReminder(reminder: ScheduledMemberPaymentReminder): Promise<void>;
  close?(): Promise<void>;
}

export class BullMqMemberReminderQueue implements MemberReminderQueue {
  private readonly queue: Queue<MemberPaymentReminderJob>;

  constructor(queue: Queue<MemberPaymentReminderJob>) {
    this.queue = queue;
  }

  async scheduleMemberPaymentReminder(reminder: ScheduledMemberPaymentReminder): Promise<void> {
    const delay = Math.max(0, reminder.runAt.getTime() - Date.now());
    const name = reminder.job.trigger === 'BEFORE_DUE' ? 'member-payment-before-due' : 'member-payment-after-due';

    await this.queue.add(name, reminder.job, {
      delay,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class InMemoryMemberReminderQueue implements MemberReminderQueue {
  readonly reminders: ScheduledMemberPaymentReminder[] = [];

  async scheduleMemberPaymentReminder(reminder: ScheduledMemberPaymentReminder): Promise<void> {
    this.reminders.push(reminder);
  }

  async close(): Promise<void> {
    this.reminders.length = 0;
  }
}

export function createBullMqMemberReminderQueue(
  queue: Queue<MemberPaymentReminderJob>
): MemberReminderQueue {
  return new BullMqMemberReminderQueue(queue);
}

export function createInMemoryMemberReminderQueue(): InMemoryMemberReminderQueue {
  return new InMemoryMemberReminderQueue();
}
