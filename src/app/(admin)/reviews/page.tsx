import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import { fmtDate, fmtDateTime } from "@/components/format";
import { listReviews } from "@/lib/queries";

export const metadata = { title: "Service Reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "submitted" ? "submitted" : "pending";
  const [pending, submitted] = await Promise.all([listReviews("pending"), listReviews("submitted")]);
  const rows = tab === "pending" ? pending : submitted;
  const action = (r: (typeof rows)[number]) => (
    <Link className={`btn sm ${tab === "pending" ? "primary" : ""}`} href={`/reviews/submit?department=${r.department_id}&session=${r.session_id}`}>
      {tab === "pending" ? "Submit review" : "View or correct"}
    </Link>
  );
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Service Reviews</h1></div>
      <nav className="tabs" style={{ maxWidth: 420 }}>
        <Link href="/reviews" className={tab === "pending" ? "active" : ""}>Pending ({pending.length})</Link>
        <Link href="/reviews?tab=submitted" className={tab === "submitted" ? "active" : ""}>Submitted ({submitted.length})</Link>
      </nav>
      <section className="card">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="Nothing here."
          mobile={(r) => (
            <div className="spread">
              <span>
                <strong>{r.department_name}</strong>
                <span className="sub">{fmtDate(r.date)}, {r.program_name}{r.submitted_at ? `. Submitted ${fmtDateTime(r.submitted_at)}` : ""}</span>
              </span>
              {action(r)}
            </div>
          )}
          columns={[
            { label: "Department", render: (r) => <strong style={{ fontWeight: 500 }}>{r.department_name}</strong> },
            { label: "Service", render: (r) => r.program_name },
            { label: "Date", nowrap: true, render: (r) => fmtDate(r.date) },
            { label: tab === "pending" ? "Status" : "Submitted", nowrap: true, render: (r) => (r.submitted_at ? fmtDateTime(r.submitted_at) : <span className="badge warn">Pending</span>) },
            { label: "Actions", render: action },
          ]}
        />
      </section>
    </div>
  );
}
