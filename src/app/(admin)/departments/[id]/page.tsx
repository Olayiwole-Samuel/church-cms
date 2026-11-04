import Link from "next/link";
import { notFound } from "next/navigation";
import { AddMember } from "@/components/AddMember";
import { PersonCell } from "@/components/DataTable";
import { fmtDateTime } from "@/components/format";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { departmentMembers, getDepartment } from "@/lib/queries";

export const metadata = { title: "Department" };

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const department = await getDepartment(id);
  if (!department) notFound();
  const members = await departmentMembers(id);
  const groups: [string, string, typeof members][] = [
    ["Active", "good", members.filter((m) => m.status === "active")],
    ["Waiting Corner", "warn", members.filter((m) => m.status === "waiting_corner")],
    ["Permanently removed", "danger", members.filter((m) => m.status === "permanently_removed")],
  ];

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{department.name}</h1>
          {department.archived_at && <span className="badge danger">Archived</span>}
        </div>
        <div className="head-actions">
          <Link className="btn" href={`/department-attendance?department=${id}`}>Attendance</Link>
          <SheetButton label="Rename" title="Rename department">
            <ApiForm path={`/api/departments/${id}`} method="PUT" submitLabel="Save" resetOnSuccess={false} fields={[{ name: "name", label: "Name", required: true, defaultValue: department.name }]} />
          </SheetButton>
          {department.archived_at ? (
            <ActionButton className="btn" path={`/api/departments/${id}`} method="PUT" body={{ archived: false }}>Restore</ActionButton>
          ) : (
            <ActionButton className="btn" path={`/api/departments/${id}`} method="PUT" body={{ archived: true }} confirm="Archive this department? Its history is kept and you can restore it.">Archive</ActionButton>
          )}
          <SheetButton label="Add Member" title="Add a member" className="btn primary">
            <p className="small muted">Someone already in another department is moved here. People can only be in one department.</p>
            <AddMember departmentId={id} />
          </SheetButton>
        </div>
      </div>

      <div className="split">
        <div className="side">
          <section className="card">
            <h2>Permanent QR code</h2>
            <p className="small muted">A person&apos;s first scan locks them to a department. Only you can change it afterwards.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr-box" src={`/api/departments/${id}/qr?format=png`} alt={`Check-in QR code for ${department.name}`} />
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <a className="btn sm" href={`/api/departments/${id}/qr?format=png&download=1`}>Download PNG</a>
              <a className="btn sm" href={`/api/departments/${id}/qr?format=svg&download=1`}>Download SVG</a>
              <Link className="btn sm" href={`/checkin/dept/${department.qr_token}`} target="_blank">Open check-in page</Link>
            </div>
          </section>
        </div>
        <div className="main-col">
          {groups.map(([title, tone, list]) => (
            <section className="card" key={title}>
              <div className="panel-head">
                <h2>{title} ({list.length})</h2>
                {title === "Waiting Corner" && list.length > 0 && <Link href="/waiting-corner">Manage</Link>}
              </div>
              {list.length === 0 ? <p className="empty">Nobody here.</p> : (
                <ul className="list">
                  {list.map((m) => (
                    <li key={m.id} className="spread">
                      <Link href={`/people/${m.person_id}`} style={{ color: "var(--text)" }}><PersonCell name={m.full_name} /></Link>
                      <span className="small muted">
                        {m.status === "permanently_removed" ? `Removed ${fmtDateTime(m.removed_at)}` : (
                          <span className={`badge ${m.miss_streak > 0 ? tone : ""}`}>{m.miss_streak} missed in a row</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
