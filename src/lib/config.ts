import type { EngineConfig } from "./engine";

const intEnv = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const engineConfig = (): EngineConfig => ({
  firstTimerWindowDays: intEnv("FIRST_TIMER_WINDOW_DAYS", 30),
  dropOffMisses: intEnv("DROP_OFF_MISSES", 4),
  firstTimerFollowUpDays: intEnv("FIRST_TIMER_FOLLOW_UP_DAYS", 7),
});

export const churchName = () => process.env.NEXT_PUBLIC_CHURCH_NAME || "The Triumphant Family";

/** Today's date (YYYY-MM-DD) in the church's own timezone, not the server's. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.CHURCH_TIMEZONE || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const checkinRateLimit = () => intEnv("CHECKIN_RATE_LIMIT_PER_MINUTE", 300);
