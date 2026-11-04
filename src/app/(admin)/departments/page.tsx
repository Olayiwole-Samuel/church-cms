import { DataTable } from "@/components/DataTable";
import { ApiForm, SheetButton } from "@/components/ui";
import { listDepartments } from "@/lib/queries";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const departments = await listDepartments(true);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Departments</h1>
        <SheetButton label="New Department" title="New department" className="btn primary">
          <ApiForm path="/api/departments" submitLabel="Create department" fields={[{ name: "name", label: "Name", required: true }]} />
        </SheetButton>
      </div>
      <section className="card">
        <DataTable
          rows={departments}
          rowKey={(d) => d.id}
          href={(d) => `/departments/${d.id}`}
          empty="No departments yet."
          mobile={(d) => (
            <>
              {d.name}
              <span className="row-tags">
                <span className="badge good">{d.active_count} active</span>
                {d.waiting_count > 0 && <span className="badge warn">{d.waiting_count} waiting</span>}
                {d.removed_count > 0 && <span className="badge danger">{d.removed_count} removed</span>}
                {d.archived_at && <span className="badge danger">Archived</span>}
              </span>
            </>
          )}
          columns={[
            { label: "Department", render: (d) => d.name },
            { label: "Active", align: "right", render: (d) => d.active_count },
            { label: "Waiting Corner", align: "right", render: (d) => d.waiting_count },
            { label: "Removed", align: "right", render: (d) => d.removed_count },
            { label: "Status", render: (d) => (d.archived_at ? <span className="badge danger">Archived</span> : <span className="badge good">Active</span>) },
          ]}
        />
      </section>
    </div>
  );
}
