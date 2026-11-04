import Link from "next/link";
import { eventLabel, fmtDate, fmtDateTime } from "@/components/format";
import { ActionButton, ConfirmDialogButton } from "@/components/ui";
import { waitingCorner } from "@/lib/queries";

export const metadata = { title: "Waiting Corner" };

export default async function WaitingCornerPage() {
  const people = await waitingCorner();
  const departments = [...new Set(people.map((p) => p.department_name as string))];
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Waiting Corner</h1></div>
      {people.length === 0 && <section className="card"><p className="empty">Nobody is in the Waiting Corner.</p></section>}
      <div className="columns-2">
        {departments.map((name) => (
          <section className="card" key={name}>
            <h2>{name}</h2>
            <ul className="list">
              {people.filter((p) => p.department_name === name).map((p) => (
                <li key={p.person_id}>
                  <Link href={`/people/${p.person_id}`}><strong>{p.full_name}</strong></Link>{" "}
                  <span className="small muted">{p.phone ?? ""}</span>
                  <div className="small muted" style={{ marginTop: "0.35rem" }}>
                    Missed: {p.misses.map((m: { date: string; program: string }) => `${fmtDate(m.date)} (${m.program})`).join(", ") || "none recorded"}
                  </div>
                  <ul className="small muted" style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                    {p.events.map((e: { event_type: string; occurred_at: string }, i: number) => (
                      <li key={i}>{eventLabel(e.event_type)}, {fmtDateTime(e.occurred_at)}</li>
                    ))}
                  </ul>
                  <div className="row" style={{ marginTop: 10 }}>
                    <ActionButton className="btn sm primary" path={`/api/departments/${p.department_id}/members/${p.person_id}/restore`}>Restore</ActionButton>
                    <ConfirmDialogButton
                      label="Permanently Remove"
                      title={`Permanently remove ${p.full_name}?`}
                      description={`This removes them from ${name} for good. It cannot be undone, and they cannot rejoin this department.`}
                      confirmLabel="Yes, remove permanently"
                      path={`/api/departments/${p.department_id}/members/${p.person_id}/remove`}
                      body={{ confirm: true }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
