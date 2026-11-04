import Link from "next/link";
import { AutoSelect } from "@/components/AutoSelect";
import { PersonCell } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { ActionButton } from "@/components/ui";
import { departmentSessionRoster, listDepartments, recentSessions } from "@/lib/queries";

export const metadata = { title: "Department Attendance" };

export default async function DepartmentAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [departments, sessions] = await Promise.all([listDepartments(), recentSessions(40)]);
  const department = departments.find((d) => d.id === sp.department) ?? departments[0];
  const session = sessions.find((s) => s.id === sp.session) ?? sessions[0];
  const roster = department && session ? await departmentSessionRoster(department.id, session.id) : [];
  const unmarked = roster.filter((r) => r.present === null).length;
  const served = roster.filter((r) => r.present === true).length;
  const missed = roster.filter((r) => r.present === false).length;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Department Attendance</h1>
          <p className="page-sub">Marked separately from general attendance. Being at church does not count as serving.</p>
        </div>
      </div>
      {!department || !session ? (
        <section className="card"><p className="empty">You need a department and a session first.</p></section>
      ) : (
        <div className="split">
          <div className="side">
            <section className="card">
              <form method="get">
                <div className="field">
                  <label htmlFor="department">Department</label>
                  <AutoSelect id="department" name="department" defaultValue={department.id}>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </AutoSelect>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="session">Service</label>
                  <AutoSelect id="session" name="session" defaultValue={session.id}>
                    {sessions.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.date)}, {s.program_name}</option>)}
                  </AutoSelect>
                </div>
              </form>
            </section>
            <div className="stats only-wide" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="stat"><b>{served}</b><span>Served</span></div>
              <div className="stat"><b>{missed}</b><span>Missed</span></div>
              <div className="stat"><b>{unmarked}</b><span>No scan</span></div>
            </div>
            {unmarked > 0 && (
              <ActionButton
                className="btn block"
                path={`/api/departments/${department.id}/close-out`}
                body={{ session_id: session.id }}
                confirm={`Mark the ${unmarked} people with no scan as missed? Two misses in a row moves someone to the Waiting Corner. The daily job does this automatically after the service day.`}
              >
                Close service: mark {unmarked} missed
              </ActionButton>
            )}
          </div>
          <div className="main-col">
            <section className="card">
              <h2>{department.name}, {fmtDate(session.date)}</h2>
              {roster.length === 0 ? <p className="empty">This department has no members.</p> : (
                <ul className="list">
                  {roster.map((r) => (
                    <li key={r.person_id} className="spread">
                      <span className="row">
                        <Link href={`/people/${r.person_id}`} style={{ color: "var(--text)" }}><PersonCell name={r.full_name} /></Link>
                        {r.status === "waiting_corner" && <span className="badge warn">Waiting Corner</span>}
                        {r.present === true && <span className="badge good">Served{r.method === "qr" ? " (QR)" : ""}</span>}
                        {r.present === false && <span className="badge danger">Missed</span>}
                        {r.present === null && <span className="badge">No scan yet</span>}
                      </span>
                      <span className="row">
                        {r.present !== true && (
                          <ActionButton path={`/api/departments/${department.id}/attendance`} body={{ session_id: session.id, person_id: r.person_id, present: true }}>Mark present</ActionButton>
                        )}
                        {r.present !== false && (
                          <ActionButton path={`/api/departments/${department.id}/attendance`} body={{ session_id: session.id, person_id: r.person_id, present: false }}>Mark missed</ActionButton>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
