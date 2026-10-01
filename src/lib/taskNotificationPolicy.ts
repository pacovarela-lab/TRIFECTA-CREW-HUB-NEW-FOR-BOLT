export type TaskNotificationInput = {
  op: "INSERT" | "UPDATE";
  taskId: string;
  assignedWorkerId: string | null;
  previousAssignedWorkerId?: string | null;
  hasStartsAt: boolean;
  assigneeHasUser: boolean;
  closing?: boolean;
};

/**
 * Reference spec for public.enqueue_task_notifications():
 * TASK_ASSIGNED_SMS is enqueued only on creation with an assigned worker,
 * or when the assigned worker actually changes. Reschedules and unrelated
 * edits never re-enqueue it.
 */
export function shouldEnqueueAssignedSms(input: TaskNotificationInput): boolean {
  if (input.closing) return false;
  if (!input.assignedWorkerId || !input.assigneeHasUser || !input.hasStartsAt) return false;
  if (input.op === "INSERT") return true;
  return (input.previousAssignedWorkerId ?? null) !== input.assignedWorkerId;
}

/** Idempotency key is worker-scoped so version bumps cannot mint a new assigned SMS. */
export function assignedSmsIdempotencyKey(taskId: string, workerId: string): string {
  return `assigned:${taskId}:${workerId}`;
}
