import { describe, expect, it } from "vitest";
import {
  computeAcademyStats,
  computeMissStreak,
  computeProgramStats,
  EngineConfig,
  isSundayDate,
  pickCheckinSession,
  compareMonths,
  serviceChanges,
  summariseMonth,
  SessionMark,
  shouldEnterWaitingCorner,
  STATUS,
} from "../src/lib/engine";

const config: EngineConfig = { firstTimerWindowDays: 30, dropOffMisses: 4, firstTimerFollowUpDays: 7 };
const TODAY = "2026-06-28"; // a Sunday

/** Weekly sessions ending on TODAY. "P" present, "A" recorded absent, "." no record. */
function marks(pattern: string, end = TODAY): SessionMark[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return [...pattern].map((c, i) => ({
    date: new Date(endMs - (pattern.length - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10),
    present: c === "P" ? true : c === "A" ? false : undefined,
  }));
}
const stats = (pattern: string, counts = true) => computeProgramStats(marks(pattern), counts, TODAY, config);

describe("5.1 streak", () => {
  it("counts back from the latest session and stops at the first miss", () => {
    expect(stats("PPAPP")!.currentStreak).toBe(2);
    expect(stats("PPPP")!.currentStreak).toBe(4);
    expect(stats("PPPA")!.currentStreak).toBe(0);
  });
  it("treats a past session with no record as a miss", () => {
    expect(stats("PP.PP")!.currentStreak).toBe(2);
  });
  it("does not count today's session as a miss until it has a record", () => {
    expect(stats("PPP.")!.currentStreak).toBe(3);
    expect(stats("PPPA")!.currentStreak).toBe(0);
  });
  it("leaves the streak at 0 for programs that do not count", () => {
    expect(stats("PPPPPP", false)!.currentStreak).toBe(0);
    expect(stats("PPPPPP", false)!.status).toBe(STATUS.occasional);
  });
  it("ignores future sessions", () => {
    const future = [...marks("PP"), { date: "2026-07-05", present: undefined }];
    expect(computeProgramStats(future, true, TODAY, config)!.currentStreak).toBe(2);
  });
});

describe("5.1 status", () => {
  it("returns nothing for someone who never attended", () => {
    expect(stats("AA.")).toBeNull();
  });
  it("First Timer: one attendance within the window", () => {
    expect(stats("P")!.status).toBe(STATUS.firstTimer);
    expect(stats("P...")!.status).toBe(STATUS.firstTimer);
  });
  it("Never Returned: one attendance older than the window", () => {
    expect(stats("P.....")!.status).toBe(STATUS.neverReturned);
  });
  it("the window is exclusive: exactly 30 days is still First Timer", () => {
    const m: SessionMark[] = [{ date: "2026-05-29", present: true }];
    expect(computeProgramStats(m, true, TODAY, config)!.status).toBe(STATUS.firstTimer);
    const n: SessionMark[] = [{ date: "2026-05-28", present: true }];
    expect(computeProgramStats(n, true, TODAY, config)!.status).toBe(STATUS.neverReturned);
  });
  it("Consistent: streak of 4 or more", () => {
    expect(stats("PPP")!.status).toBe(STATUS.occasional);
    expect(stats("PPPP")!.status).toBe(STATUS.consistent);
  });
  it("Dropped Off: was consistent and missed the last N", () => {
    expect(stats("PPPPAAA")!.status).toBe(STATUS.occasional);
    expect(stats("PPPPAAAA")!.status).toBe(STATUS.droppedOff);
  });
  it("Occasional: not consistent, missing many is not a drop-off", () => {
    expect(stats("PPPAAAAAA")!.status).toBe(STATUS.occasional);
  });
});

describe("5.4 absence trigger", () => {
  it("fires for a consistent member on 2 and 3 straight misses only", () => {
    expect(stats("PPPPA")!.absenceTriggered).toBe(false);
    expect(stats("PPPPAA")!.absenceTriggered).toBe(true);
    expect(stats("PPPPAAA")!.absenceTriggered).toBe(true);
    expect(stats("PPPPAAAA")!.absenceTriggered).toBe(false);
  });
  it("does not fire for someone who was not consistent", () => {
    expect(stats("PPPAA")!.absenceTriggered).toBe(false);
  });
});

describe("5.2 academy", () => {
  it("needs 4 consecutive Sundays", () => {
    expect(computeAcademyStats(marks("PPP"), TODAY).readySince).toBeNull();
    expect(computeAcademyStats(marks("PPPP"), TODAY).readySince).toBe(TODAY);
    expect(computeAcademyStats(marks("PPAPP"), TODAY).readySince).toBeNull();
  });
  it("stays ready after later misses, until enrolled", () => {
    const result = computeAcademyStats(marks("PPPPAA"), TODAY);
    expect(result.readySince).toBe("2026-06-14");
    expect(result.sundayStreak).toBe(0);
  });
  it("treats two Sunday services on one date as one Sunday", () => {
    const both = [
      ...marks("PPP", "2026-06-21"),
      { date: TODAY, present: false },
      { date: TODAY, present: true },
    ];
    expect(computeAcademyStats(both, TODAY).sundayStreak).toBe(4);
    const notFour = [...marks("P", "2026-06-21"), { date: TODAY, present: true }, { date: TODAY, present: true }];
    expect(computeAcademyStats(notFour, TODAY).sundayStreak).toBe(2);
  });
  it("validates real Sundays", () => {
    expect(isSundayDate("2026-06-28")).toBe(true);
    expect(isSundayDate("2026-06-24")).toBe(false);
  });
});

describe("monthly attendance", () => {
  it("never adds services together: 24 then 20 averages 22, not 44", () => {
    expect(summariseMonth([24, 20])).toEqual({ serviceCount: 2, average: 22, highest: 24, lowest: 20 });
  });
  it("shows each service against the one before", () => {
    expect(serviceChanges([24, 20, 26])).toEqual([null, -4, 6]);
  });
  it("reports an increase or decrease between months", () => {
    expect(compareMonths(summariseMonth([24, 24]), summariseMonth([20, 20]))).toEqual({ net: 4, percent: 20 });
    expect(compareMonths(summariseMonth([18]), summariseMonth([24]))).toEqual({ net: -6, percent: -25 });
    expect(compareMonths(summariseMonth([20, 24]), summariseMonth([22]))).toEqual({ net: 0, percent: 0 });
  });
  it("is not skewed by a month having more services", () => {
    expect(compareMonths(summariseMonth([20, 20, 20, 20, 20]), summariseMonth([20, 20, 20, 20]))!.net).toBe(0);
  });
  it("has nothing to compare when either month had no services", () => {
    expect(compareMonths(summariseMonth([]), summariseMonth([20]))).toBeNull();
    expect(compareMonths(summariseMonth([20]), summariseMonth([]))).toBeNull();
    expect(summariseMonth([])).toEqual({ serviceCount: 0, average: 0, highest: 0, lowest: 0 });
  });
});

describe("5.3 department miss counter", () => {
  const m = (date: string, present: boolean, recordedAt = `${date}T20:00:00Z`) => ({ date, present, recordedAt });

  it("counts consecutive misses and a scan resets it", () => {
    expect(computeMissStreak([m("2026-06-07", false), m("2026-06-14", false)], null, null)).toBe(2);
    expect(computeMissStreak([m("2026-06-07", false), m("2026-06-14", true)], null, null)).toBe(0);
  });
  it("restore resets the counter, and later misses count from zero", () => {
    const history = [m("2026-06-07", false), m("2026-06-14", false)];
    expect(computeMissStreak(history, "2026-06-15T09:00:00Z", "2026-06-15")).toBe(0);
    expect(computeMissStreak([...history, m("2026-06-21", false)], "2026-06-15T09:00:00Z", "2026-06-15")).toBe(1);
    expect(computeMissStreak([...history, m("2026-06-21", false), m("2026-06-28", false)], "2026-06-15T09:00:00Z", "2026-06-15")).toBe(2);
  });
  it("only an active member moves to the Waiting Corner, at 2 misses", () => {
    expect(shouldEnterWaitingCorner(1, "active")).toBe(false);
    expect(shouldEnterWaitingCorner(2, "active")).toBe(true);
    expect(shouldEnterWaitingCorner(3, "waiting_corner")).toBe(false);
    expect(shouldEnterWaitingCorner(5, "permanently_removed")).toBe(false);
  });
});

describe("which service a member check-in goes to", () => {
  const sunday = { id: "s1", program_id: "sunday" };
  const youth = { id: "s2", program_id: "youth" };
  it("uses the only service today, whichever program the code was printed for", () => {
    expect(pickCheckinSession([sunday], { preferredProgramId: null })).toBe(sunday);
    expect(pickCheckinSession([sunday], { preferredProgramId: "midweek" })).toBe(sunday);
  });
  it("asks when two services run and the code does not belong to either", () => {
    expect(pickCheckinSession([sunday, youth], { preferredProgramId: null })).toBe("choose");
    expect(pickCheckinSession([sunday, youth], { preferredProgramId: "youth" })).toBe(youth);
  });
  it("honours a choice only if that service is open today, and finds nothing on a day with no service", () => {
    expect(pickCheckinSession([sunday, youth], { chosenId: "s2" })).toBe(youth);
    expect(pickCheckinSession([sunday], { chosenId: "other" })).toBeNull();
    expect(pickCheckinSession([], {})).toBeNull();
  });
});
