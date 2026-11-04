import Link from "next/link";
import { ReactNode } from "react";
import { LineChart } from "@/components/Charts";
import { fmtDate, reasonLabel } from "@/components/format";
import { Icon } from "@/components/icons";
import {
  absenceAlerts,
  academyReady,
  altarCallMonitor,
  dashboard,
  listFollowUps,
  listPrograms,
  listReviews,
  report,
  todaysServices,
  waitingCorner,
} from "@/lib/queries";

export const metadata = { title: "Dashboard" };
const LIMIT = 5;

function Panel(props: { title: string; href: string; className?: string; empty: string; count: number; children: ReactNode }) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      <div className="panel-head">
        <h2>{props.title}</h2>
        <Link href={props.href}>See all</Link>
      </div>
      {props.count === 0 ? <p className="empty">{props.empty}</p> : <ul className="list">{props.children}</ul>}
    </section>
  );
}

function Row(props: { href: string; title: ReactNode; sub?: ReactNode; trail?: ReactNode }) {
  return (
    <li>
      <Link className="nav-row" href={props.href}>
        <span className="grow">
          {props.title}
          {props.sub && <span className="sub">{props.sub}</span>}
        </span>
        {props.trail}
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const [d, services, followUps, reviews, ready, alerts, waiting, altar, trends, programs] = await Promise.all([
    dashboard(),
    todaysServices(),
    listFollowUps("open"),
    listReviews("pending"),
    academyReady(),
    absenceAlerts(),
    waitingCorner(),
    altarCallMonitor(),
    report("attendance-trends"),
    listPrograms(),
  ]);

  const stats: [string, number, string, string, string][] = [
    ["Today's attendance", d.attendance_today, "/attendance", "checklist", "#7c3265"],
    ["First timers today", d.first_timers_today, "/engagement?view=first-timers", "people", "#34c759"],
    ["Altar call today", d.altar_call_today, "/altar-call", "flame", "#ff9500"],
    ["Academy ready", d.academy_ready, "/academy", "cap", "#5856d6"],
    ["Pending reviews", d.pending_reviews, "/reviews", "doc", "#af52de"],
    ["Open follow-ups", d.open_follow_ups, "/follow-ups", "bubble", "#00a5c8"],
    ["Absence alerts", d.absence_alerts, "/engagement?view=absence-alerts", "clock", "#ff3b30"],
    ["In Waiting Corner", d.waiting_corner, "/waiting-corner", "hourglass", "#a2845e"],
  ];

  const trendProgram = programs.find((p) => p.is_sunday) ?? programs[0];
  const points = (trends ?? [])
    .filter((t) => t.program_name === trendProgram?.name)
    .map((t) => ({
      date: t.date,
      value: t.present,
      label: new Date(`${t.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    }));

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">{fmtDate(d.date)}</p>
        </div>
        <Link className="btn primary" href="/attendance">Take attendance</Link>
      </div>

      <div className="stats">
        {stats.map(([label, value, href, icon, color]) => (
          <Link className="stat" href={href} key={label}>
            <div className="stat-top">
              <b>{value}</b>
              <span className="icon-tile" style={{ background: color }}><Icon name={icon} size={18} stroke={2} /></span>
            </div>
            <span>{label}</span>
          </Link>
        ))}
      </div>

      <div className="dash-grid only-wide">
        <section className="card span-2">
          <div className="panel-head">
            <h2>{trendProgram ? `${trendProgram.name} attendance` : "Attendance"}</h2>
            <Link href="/reports">Reports</Link>
          </div>
          {points.length === 0 ? <p className="empty">Attendance will appear here after the first service.</p> : <LineChart points={points} wide />}
        </section>

        <Panel title="Today's services" href="/programs" count={services.length} empty="No service today. Start one from Take Attendance." className="span-2-tablet">
          {services.map((s) => (
            <Row key={s.id} href={`/attendance?program=${s.program_id}&session=${s.id}`} title={s.program_name} sub={`${s.present_count} present`} />
          ))}
        </Panel>

        <Panel title="Follow-ups" href="/follow-ups" count={followUps.length} empty="All caught up.">
          {followUps.slice(0, LIMIT).map((f) => (
            <Row
              key={f.id}
              href={`/people/${f.person_id}`}
              title={f.full_name}
              sub={reasonLabel(f.reason)}
              trail={f.priority === "high" ? <span className="badge priority">Priority</span> : undefined}
            />
          ))}
        </Panel>

        <Panel title="Pending reviews" href="/reviews" count={reviews.length} empty="Every review is in.">
          {reviews.slice(0, LIMIT).map((r) => (
            <Row key={r.id} href={`/reviews/submit?department=${r.department_id}&session=${r.session_id}`} title={r.department_name} sub={`${fmtDate(r.date)}, ${r.program_name}`} />
          ))}
        </Panel>

        <Panel title="Ready for Academy" href="/academy" count={ready.length} empty="Nobody is ready yet.">
          {ready.slice(0, LIMIT).map((p) => (
            <Row
              key={p.id}
              href={`/people/${p.id}`}
              title={p.full_name}
              sub={`Since ${fmtDate(p.ready_since)}`}
              trail={p.altar_call ? <span className="badge priority">Altar call</span> : undefined}
            />
          ))}
        </Panel>

        <Panel title="Absence alerts" href="/engagement?view=absence-alerts" count={alerts.length} empty="No open alerts.">
          {alerts.slice(0, LIMIT).map((a) => (
            <Row key={a.id} href={`/people/${a.person_id}`} title={a.full_name} sub={a.program_name} />
          ))}
        </Panel>

        <Panel title="Waiting Corner" href="/waiting-corner" count={waiting.length} empty="Nobody is waiting.">
          {waiting.slice(0, LIMIT).map((w) => (
            <Row key={`${w.person_id}${w.department_id}`} href="/waiting-corner" title={w.full_name} sub={w.department_name} />
          ))}
        </Panel>

        <Panel title="Altar call" href="/altar-call" count={altar.length} empty="Nobody yet." className="span-2-tablet">
          {altar.slice(0, LIMIT).map((p) => (
            <Row key={p.id} href={`/people/${p.id}`} title={p.full_name} sub={`Streak ${p.streak}`} />
          ))}
        </Panel>
      </div>
    </div>
  );
}
