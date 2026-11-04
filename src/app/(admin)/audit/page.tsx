import Link from "next/link";
import { DataTable } from "@/components/DataTable";
import { fmtDateTime } from "@/components/format";
import { listAudit } from "@/lib/queries";

export const metadata = { title: "Audit Log" };
const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listAudit(PAGE, (page - 1) * PAGE);
  const details = (r: (typeof rows)[number]) => (
    <details>
      <summary style={{ marginTop: 0 }}>Details</summary>
      <pre className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>
        {JSON.stringify({ before: r.before, after: r.after }, null, 1)}
      </pre>
    </details>
  );
  const entity = (r: (typeof rows)[number]) => r.entity.replace(/_/g, " ");
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Audit Log</h1></div>
      <section className="card">
        <DataTable
          rows={rows}
          rowKey={(r) => String(r.id)}
          empty="No entries."
          mobile={(r) => (
            <>
              <span style={{ textTransform: "capitalize" }}>{r.action}</span> {entity(r)}
              <span className="sub" style={{ overflowWrap: "anywhere" }}>{r.actor}, {fmtDateTime(r.created_at)}</span>
              {details(r)}
            </>
          )}
          columns={[
            { label: "When", nowrap: true, render: (r) => fmtDateTime(r.created_at) },
            { label: "Who", render: (r) => r.actor },
            { label: "Action", render: (r) => <span style={{ textTransform: "capitalize" }}>{r.action}</span> },
            { label: "Record", render: entity },
            { label: "Change", render: details },
          ]}
        />
      </section>
      <div className="spread">
        {page > 1 ? <Link className="btn sm" href={`/audit?page=${page - 1}`}>Newer</Link> : <span />}
        {rows.length === PAGE ? <Link className="btn sm" href={`/audit?page=${page + 1}`}>Older</Link> : <span />}
      </div>
    </div>
  );
}
