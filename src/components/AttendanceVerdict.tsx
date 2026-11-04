import { Icon } from "./icons";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Says the result in words as well as colour: up, down or level against the month before. */
export function AttendanceVerdict(props: {
  comparison: { net: number; percent: number | null } | null;
  average: number;
  serviceCount: number;
  previousAverage: number;
  previousLabel: string;
  size?: "lg" | "md";
}) {
  const c = props.comparison;
  const tone = !c || c.net === 0 ? "flat" : c.net > 0 ? "up" : "down";
  const icon = !c || c.net === 0 ? "minus" : c.net > 0 ? "arrowUp" : "arrowDown";
  const title = props.serviceCount === 0
    ? "No services this month"
    : !c
      ? "Nothing to compare yet"
      : c.net > 0
        ? `Increase of ${people(c.net)} per service`
        : c.net < 0
          ? `Decrease of ${people(Math.abs(c.net))} per service`
          : "No change";
  const percent = c?.percent ? `, ${c.percent > 0 ? "+" : ""}${c.percent}%` : "";
  const previousMonth = props.previousLabel.split(" ")[0];
  const sub = props.serviceCount === 0
    ? "Attendance appears here once a service is held."
    : !c
      ? `Average ${props.average} per service. ${previousMonth} had no services.`
      : c.net === 0
        ? `Average stayed at ${props.average} per service`
        : `Average ${props.average} per service, from ${props.previousAverage} in ${previousMonth}${percent}`;
  return (
    <div className={`verdict ${tone} ${props.size ?? "lg"}`}>
      <span className="verdict-icon"><Icon name={icon} size={props.size === "md" ? 20 : 28} stroke={2.6} /></span>
      <span>
        <span className="verdict-title">{title}</span>
        <span className="sub">{sub}</span>
      </span>
    </div>
  );
}
