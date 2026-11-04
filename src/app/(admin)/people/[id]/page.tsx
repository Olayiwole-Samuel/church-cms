import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/DataTable";
import { eventLabel, fmtDate, fmtDateTime, membershipLabel, reasonLabel, statusTone } from "@/components/format";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { listDepartments, listTags, personProfile } from "@/lib/queries";

export const metadata = { title: "Profile" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const profile = await personProfile(id);
  if (!profile) notFound();
  const { person: p, tags, attendance, stats, academy, memberships, events, followUps, enrollment, alerts, duplicates, departmentAttendance } = profile;
  const [allTags, departments] = await Promise.all([listTags(), listDepartments()]);
  const currentTags = tags.filter((t) => !t.removed_at);
  const addable = allTags.filter((t) => !currentTags.some((c) => c.name === t.name));
  const current = memberships.find((m) => !m.removed_at);

  return (
    <div className="split" style={{ marginTop: 4 }}>
      <div className="side">
        <section className="card detail-identity">
          <Avatar name={p.full_name} large />
          <h1 style={{ fontSize: 24, lineHeight: "30px" }}>{p.full_name}</h1>
          <div className="row" style={{ justifyContent: "center", gap: 4, marginTop: 6 }}>
            {p.status === "archived" && <span className="badge danger">Archived</span>}
            {currentTags.map((t) => <span className="badge accent" key={t.name}>{t.name}</span>)}
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <SheetButton label="Edit" title="Edit details" className="btn sm">
              <div style={{ textAlign: "left" }}>
                <ApiForm
                  path={`/api/people/${id}`}
                  method="PUT"
                  submitLabel="Save details"
                  resetOnSuccess={false}
                  columns={2}
                  fields={[
                    { name: "full_name", label: "Full name", required: true, defaultValue: p.full_name },
                    { name: "phone", label: "Phone", type: "tel", defaultValue: p.phone ?? "" },
                    { name: "email", label: "Email", type: "email", defaultValue: p.email ?? "" },
                    {
                      name: "gender",
                      label: "Gender",
                      type: "select",
                      defaultValue: p.gender ?? "",
                      options: [{ value: "", label: "Not set" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }],
                    },
                    { name: "address", label: "Address", defaultValue: p.address ?? "" },
                    { name: "source", label: "Source", defaultValue: p.source ?? "" },
                  ]}
                />
              </div>
            </SheetButton>
            {p.status === "active" ? (
              <ActionButton path={`/api/people/${id}`} method="PUT" body={{ status: "archived" }} confirm={`Archive ${p.full_name}? You can restore them later.`}>Archive</ActionButton>
            ) : (
              <ActionButton path={`/api/people/${id}`} method="PUT" body={{ status: "active" }}>Restore</ActionButton>
            )}
          </div>
        </section>

        {duplicates.length > 0 && (
          <div className="alert info" style={{ marginBottom: 0 }}>
            Possible duplicate of{" "}
            {duplicates.map((d, i) => (
              <span key={d.id}>{i > 0 && ", "}<Link href={`/people/${d.other_id}`}>{d.other_name}</Link> (same {d.matched_on})</span>
            ))}
          </div>
        )}

        <section className="card">
          <h2>Details</h2>
          <ul className="list">
            <li className="spread"><span className="muted">Phone</span>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : <span>—</span>}</li>
            <li className="spread"><span className="muted">Email</span><span style={{ overflowWrap: "anywhere" }}>{p.email ?? "—"}</span></li>
            <li className="spread"><span className="muted">Gender</span><span style={{ textTransform: "capitalize" }}>{p.gender ?? "—"}</span></li>
            <li className="spread"><span className="muted">Address</span><span>{p.address ?? "—"}</span></li>
            <li className="spread"><span className="muted">First visit</span><span>{fmtDate(p.first_visit_date)}</span></li>
            <li className="spread"><span className="muted">Source</span><span>{p.source ?? "—"}</span></li>
          </ul>
        </section>

        <section className="card">
          <h2>Tags</h2>
          <div className="row">
            {currentTags.map((t) => (
              <ActionButton key={t.name} path={`/api/people/${id}/tags`} body={{ tag: t.name, action: "remove" }}>Remove {t.name}</ActionButton>
            ))}
            {addable.map((t) => (
              <ActionButton key={t.id} path={`/api/people/${id}/tags`} body={{ tag: t.name, action: "add" }}>Add {t.name}</ActionButton>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Discipleship Academy</h2>
          {enrollment ? (
            <p><span className="badge good">Enrolled</span> {fmtDateTime(enrollment.enrolled_at)}</p>
          ) : academy?.ready_since ? (
            <p><span className="badge good">Ready</span> since {fmtDate(academy.ready_since)}. <Link href="/academy">Enroll from the Academy page</Link></p>
          ) : (
            <p className="muted">Not yet eligible.</p>
          )}
          <p className="small muted" style={{ margin: 0 }}>Current Sunday streak: {academy?.sunday_streak ?? 0}</p>
        </section>
      </div>

      <div className="main-col">
        <section className="card">
          <h2>Streak and status</h2>
          {stats.length === 0 ? <p className="empty">No attendance yet.</p> : (
            <ul className="list">
              {stats.map((s) => (
                <li key={s.program_id ?? "general"} className="spread">
                  <span>
                    {s.program_name}
                    <span className="sub">Streak {s.current_streak}, attended {s.total_attended}, last {fmtDate(s.last_attended)}</span>
                  </span>
                  <span className={`badge ${statusTone(s.status_badge)}`}>{s.status_badge}</span>
                </li>
              ))}
            </ul>
          )}
          {alerts.filter((a) => !a.resolved).map((a) => (
            <div className="alert info" key={a.id} style={{ marginTop: "0.75rem", marginBottom: 0 }}>Absence alert: {a.program_name}, raised {fmtDateTime(a.triggered_at)}</div>
          ))}
        </section>

        <section className="card">
          <h2>Department history</h2>
          {memberships.length === 0 && <p className="muted">Not in a department.</p>}
          <ul className="list">
            {memberships.map((m) => (
              <li key={m.id}>
                <strong>{m.department_name}</strong>{" "}
                <span className={`badge ${m.status === "waiting_corner" ? "warn" : m.status === "permanently_removed" ? "danger" : m.removed_at ? "" : "good"}`}>{membershipLabel(m)}</span>
                <div className="small muted">
                  Joined {fmtDateTime(m.joined_at)}
                  {m.removed_at ? `, left ${fmtDateTime(m.removed_at)}` : `, ${m.miss_streak} missed in a row`}
                </div>
              </li>
            ))}
          </ul>
          {events.length > 0 && (
            <>
              <h3 style={{ marginTop: "0.75rem" }}>Waiting Corner history</h3>
              <ul className="list">
                {events.map((e) => (
                  <li key={e.id} className="small">
                    <strong>{eventLabel(e.event_type)}</strong>: {e.department_name}, {fmtDateTime(e.occurred_at)}
                    {e.event_type === "entered_waiting_corner" && ` after ${e.miss_count_at_event} misses`}
                    {e.note && <span className="muted"> ({e.note})</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {departments.length > 0 && p.status === "active" && current?.status !== "waiting_corner" && (
            <details>
              <summary>{current ? "Change department (admin only)" : "Assign to a department"}</summary>
              <div className="row" style={{ marginTop: "0.5rem" }}>
                {departments.filter((d) => d.id !== current?.department_id).map((d) => (
                  <ActionButton
                    key={d.id}
                    path={`/api/departments/${d.id}/members`}
                    body={{ person_id: id }}
                    confirm={`Put ${p.full_name} in ${d.name}?`}
                  >
                    {d.name}
                  </ActionButton>
                ))}
              </div>
            </details>
          )}
          {departmentAttendance.length > 0 && (
            <details>
              <summary>Department attendance ({departmentAttendance.length})</summary>
              <ul className="list">
                {departmentAttendance.map((a, i) => (
                  <li key={i} className="small spread">
                    <span>{fmtDate(a.date)}, {a.program_name}, {a.department_name}</span>
                    <span className={`badge ${a.present ? "good" : "danger"}`}>{a.present ? "Served" : "Missed"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="card">
          <h2>Follow-ups</h2>
          {followUps.length === 0 ? <p className="muted" style={{ margin: 0 }}>None.</p> : (
            <ul className="list">
              {followUps.map((f) => (
                <li key={f.id} className="spread">
                  <span>
                    {reasonLabel(f.reason)} {f.priority === "high" && <span className="badge priority">Priority</span>}
                    <span className="sub">{fmtDateTime(f.created_at)}{f.assigned_to ? `, ${f.assigned_to}` : ""}</span>
                  </span>
                  <span className={`badge ${f.status === "done" ? "good" : "warn"}`}>{f.status === "done" ? "Done" : "Open"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Attendance history</h2>
          {attendance.length === 0 ? <p className="empty">No attendance yet.</p> : (
            <ul className="list">
              {attendance.map((a) => (
                <li key={a.id} className="spread">
                  <span>
                    {a.program_name}
                    <span className="sub">{fmtDate(a.date)}, by {a.method === "on_behalf" ? "someone on their behalf" : a.method === "qr" ? "QR" : "admin"}</span>
                  </span>
                  <span className="row">
                    {a.altar_call && <span className="badge priority">Altar call</span>}
                    <span className={`badge ${a.present ? "good" : "danger"}`}>{a.present ? "Present" : "Absent"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
