import Link from "next/link";
import { FollowUpCreate, FollowUpRow } from "@/components/FollowUps";
import { fmtDate, fmtDateTime, reasonLabel } from "@/components/format";
import { SheetButton } from "@/components/ui";
import { listFollowUps } from "@/lib/queries";
import { CARE_REASONS } from "@/lib/recompute";

export const metadata = { title: "Follow-Ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";
  const rows = await listFollowUps(tab);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Follow-Ups</h1>
        <SheetButton label="New Follow-Up" title="New follow-up" className="btn primary">
          <FollowUpCreate />
        </SheetButton>
      </div>
      <p className="page-sub" style={{ margin: 0 }}>People who stop coming stay here until they return. Their card closes by itself when they come back, and only you can remove someone.</p>
      <nav className="tabs" style={{ maxWidth: 320 }}>
        <Link href="/follow-ups" className={tab === "open" ? "active" : ""}>Open</Link>
        <Link href="/follow-ups?tab=done" className={tab === "done" ? "active" : ""}>Done</Link>
      </nav>
      {rows.length === 0 && <section className="card"><p className="empty">Nothing here.</p></section>}
      <div className="card-grid">
        {rows.map((f) => (
          <section className={`card ${f.priority === "high" && f.status === "open" ? "priority" : ""}`} key={f.id}>
            <div style={{ marginBottom: 10 }}>
              <Link href={`/people/${f.person_id}`}><strong>{f.full_name}</strong></Link>
              <div className="row-tags">
                <span className="badge">{reasonLabel(f.reason)}</span>
                {f.priority === "high" && <span className="badge priority">Priority</span>}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {f.phone ?? "No phone"}. Last came: {f.last_came ? fmtDate(f.last_came) : "never"}
                <br />Raised {fmtDateTime(f.created_at)}
              </div>
            </div>
            <FollowUpRow
              id={f.id}
              status={f.status}
              assignedTo={f.assigned_to}
              notes={f.notes}
              stayUntilReturn={CARE_REASONS.includes(f.reason)}
              personId={f.person_id}
              personName={f.full_name}
              personArchived={f.person_status === "archived"}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
