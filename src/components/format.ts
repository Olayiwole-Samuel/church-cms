const TZ = () => process.env.CHURCH_TIMEZONE || "UTC";

/** Formats a YYYY-MM-DD session date without any timezone shifting. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    weekday: "short",
    timeZone: "UTC",
  });
}

export function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ() });
}

const REASONS: Record<string, string> = {
  first_timer: "First timer, no return",
  drop_off: "Dropped off",
  altar_call: "Altar call",
  absence: "Not coming",
};
export const reasonLabel = (reason: string) => REASONS[reason] ?? reason;

const EVENTS: Record<string, string> = {
  entered_waiting_corner: "Entered Waiting Corner",
  restored: "Restored",
  permanently_removed: "Permanently removed",
};
export const eventLabel = (event: string) => EVENTS[event] ?? event;

export function statusTone(status: string): string {
  if (status === "Consistent") return "good";
  if (status === "Dropped Off" || status === "Never Returned") return "danger";
  if (status === "First Timer") return "accent";
  return "";
}

export const membershipLabel = (m: Record<string, unknown>) =>
  m.status === "permanently_removed"
    ? "Permanently removed"
    : m.removed_at
      ? "Moved to another department"
      : m.status === "waiting_corner"
        ? "Waiting Corner"
        : "Active";
