import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/components/format";
import { ActionButton } from "@/components/ui";
import { academyEnrolled, academyReady } from "@/lib/queries";

export const metadata = { title: "Discipleship Academy" };

export default async function AcademyPage() {
  const [ready, enrolled] = await Promise.all([academyReady(), academyEnrolled()]);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Discipleship Academy</h1>
          <p className="page-sub">4 consecutive Sundays. Midweek and special programs never count here.</p>
        </div>
      </div>
      <div className="columns-2">
        <section className="card">
          <h2>Ready ({ready.length})</h2>
          {ready.length === 0 ? <p className="empty">Nobody is ready yet.</p> : (
            <ul className="list">
              {ready.map((p) => (
                <li key={p.id} className="spread">
                  <span>
                    <Link href={`/people/${p.id}`}>{p.full_name}</Link>{" "}
                    {p.altar_call && <span className="badge priority">Altar call priority</span>}
                    <span className="sub">Reached {fmtDate(p.ready_since)}</span>
                  </span>
                  <ActionButton className="btn sm primary" path="/api/academy/enroll" body={{ person_id: p.id }}>Enroll</ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Enrolled ({enrolled.length})</h2>
          {enrolled.length === 0 ? <p className="empty">Nobody enrolled yet.</p> : (
            <ul className="list">
              {enrolled.map((p) => (
                <li key={p.id} className="spread">
                  <Link href={`/people/${p.id}`}>{p.full_name}</Link>
                  <span className="small muted">{fmtDateTime(p.enrolled_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
