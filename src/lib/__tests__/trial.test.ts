import { describe, expect, it } from "vitest";
import { canWrite, computeTrialState, daysRemaining, isTrialExpiredError, trialBadge } from "@/lib/trial";

const now = new Date("2026-08-26T00:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe("trial state (mirror of the SQL rule)", () => {
  it("A — new company gets ~30 days and is active", () => {
    const state = computeTrialState({ trial_status: "active", trial_ends_at: inDays(30) }, now);
    expect(state).toBe("active");
    expect(daysRemaining(inDays(30), now)).toBe(30);
  });

  it("B — active trial allows writes", () => {
    expect(canWrite({ state: "active", trialEndsAt: inDays(5), daysRemaining: 5 })).toBe(true);
  });

  it("C — expired trial blocks writes but keeps reads (state only, no data change)", () => {
    const state = computeTrialState({ trial_status: "active", trial_ends_at: inDays(-1) }, now);
    expect(state).toBe("expired");
    expect(canWrite({ state, trialEndsAt: inDays(-1), daysRemaining: 0 })).toBe(false);
  });

  it("D — exempt tenant is never blocked, even with odd trial fields", () => {
    expect(computeTrialState({ trial_exempt: true, trial_status: "active", trial_ends_at: null }, now)).toBe("exempt");
    expect(computeTrialState({ trial_exempt: true, trial_status: "suspended", trial_ends_at: inDays(-99) }, now)).toBe("exempt");
    expect(canWrite({ state: "exempt", trialEndsAt: null, daysRemaining: null })).toBe(true);
  });

  it("E — unknown/absent snapshot never grants a client-side bypass of the DB trigger", () => {
    expect(computeTrialState(null, now)).toBe("unknown");
    expect(isTrialExpiredError({ message: 'new row violates: trial_expired' })).toBe(true);
    expect(isTrialExpiredError({ message: "some other error" })).toBe(false);
  });

  it("F — tenant A state does not influence tenant B", () => {
    const a = computeTrialState({ trial_status: "active", trial_ends_at: inDays(-3) }, now);
    const b = computeTrialState({ trial_status: "active", trial_ends_at: inDays(12) }, now);
    expect(a).toBe("expired");
    expect(b).toBe("active");
  });

  it("G — paid/extended states keep writes open (future reactivation point)", () => {
    expect(computeTrialState({ trial_status: "paid", trial_ends_at: inDays(-40) }, now)).toBe("exempt");
    expect(computeTrialState({ trial_status: "extended", trial_ends_at: inDays(-1) }, now)).toBe("exempt");
    expect(computeTrialState({ trial_status: "suspended", trial_ends_at: inDays(40) }, now)).toBe("expired");
  });

  it("H — evaluating repeatedly never restarts or extends the trial", () => {
    const company = { trial_status: "active", trial_ends_at: inDays(2) };
    expect(computeTrialState(company, now)).toBe("active");
    expect(computeTrialState(company, new Date(now.getTime() + 3 * 86_400_000))).toBe("expired");
  });

  it("I — expiry is evaluated on absolute UTC instants, regardless of local offsets", () => {
    const ends = "2026-08-26T00:00:00Z";
    expect(computeTrialState({ trial_status: "active", trial_ends_at: ends }, new Date("2026-08-25T23:59:59Z"))).toBe("active");
    expect(computeTrialState({ trial_status: "active", trial_ends_at: ends }, new Date("2026-08-26T00:00:01Z"))).toBe("expired");
  });

  it("J — badges appear only while active and get urgent at 7/3/1 days", () => {
    expect(trialBadge({ state: "expired", trialEndsAt: inDays(-1), daysRemaining: 0 })).toBeNull();
    expect(trialBadge({ state: "active", trialEndsAt: inDays(20), daysRemaining: 20 })).toEqual({
      text: "Te quedan 20 días de prueba",
      urgent: false,
    });
    expect(trialBadge({ state: "active", trialEndsAt: inDays(1), daysRemaining: 1 })?.urgent).toBe(true);
    expect(trialBadge({ state: "active", trialEndsAt: inDays(1), daysRemaining: 1 })?.text).toBe("Te queda 1 día de prueba");
  });
});
