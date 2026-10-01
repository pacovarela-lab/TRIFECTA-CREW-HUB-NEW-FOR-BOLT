import { describe, expect, it } from "vitest";
import { assignedSmsIdempotencyKey, shouldEnqueueAssignedSms } from "../taskNotificationPolicy";

const base = { taskId: "t1", hasStartsAt: true, assigneeHasUser: true } as const;

describe("TASK_ASSIGNED_SMS policy", () => {
  it("A - creation with worker enqueues exactly one assigned SMS", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "INSERT", assignedWorkerId: "A" })).toBe(true);
  });
  it("B - reschedule (date/time only) enqueues none", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "A", previousAssignedWorkerId: "A" })).toBe(false);
  });
  it("C - worker change A->B enqueues one for B with a B-scoped key", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "B", previousAssignedWorkerId: "A" })).toBe(true);
    expect(assignedSmsIdempotencyKey("t1", "B")).not.toBe(assignedSmsIdempotencyKey("t1", "A"));
  });
  it("D - unrelated edits enqueue none", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "A", previousAssignedWorkerId: "A" })).toBe(false);
  });
  it("E - repeated reschedules never enqueue and keep a stable key", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "A", previousAssignedWorkerId: "A" })).toBe(false);
    }
    expect(assignedSmsIdempotencyKey("t1", "A")).toBe("assigned:t1:A");
  });
  it("F - worker change plus reschedule enqueues exactly one for B", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "B", previousAssignedWorkerId: "A" })).toBe(true);
  });
  it("G - same worker id on update enqueues none", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "UPDATE", assignedWorkerId: "A", previousAssignedWorkerId: "A" })).toBe(false);
  });
  it("closing, unassigned or unscheduled tasks never enqueue", () => {
    expect(shouldEnqueueAssignedSms({ ...base, op: "INSERT", assignedWorkerId: "A", closing: true })).toBe(false);
    expect(shouldEnqueueAssignedSms({ ...base, op: "INSERT", assignedWorkerId: null })).toBe(false);
    expect(shouldEnqueueAssignedSms({ ...base, op: "INSERT", assignedWorkerId: "A", hasStartsAt: false })).toBe(false);
    expect(shouldEnqueueAssignedSms({ ...base, op: "INSERT", assignedWorkerId: "A", assigneeHasUser: false })).toBe(false);
  });
});
