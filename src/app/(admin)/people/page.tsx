import Link from "next/link";
import { AutoSelect } from "@/components/AutoSelect";
import { DataTable, PersonCell } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { ImportPeople } from "@/components/ImportPeople";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { listPeople, listTags, openDuplicates } from "@/lib/queries";

export const metadata = { title: "People" };
const PAGE = 50;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const page = Math.max(1, Number(sp.page) || 1);
  const tagId = /^[0-9a-f-]{36}$/.test(sp.tag ?? "") ? sp.tag : undefined;
  const [{ rows, total }, tags, duplicates] = await Promise.all([
    listPeople({ q: sp.q, tag: tagId, status, limit: PAGE, offset: (page - 1) * PAGE }),
    listTags(),
    openDuplicates(),
  ]);
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (tagId) params.set("tag", tagId);
    params.set("status", status);
    params.set("page", String(p));
    return `/people?${params}`;
  };
  const tagBadges = (p: (typeof rows)[number]) => (
    <>
      {p.status === "archived" && <span className="badge">Archived</span>}
      {p.tags.map((t: string) => <span className="badge accent" key={t}>{t}</span>)}
    </>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>People</h1>
          <p className="page-sub">{total} found</p>
        </div>
        <div className="head-actions">
          <SheetButton label="Import CSV" title="Import people from CSV">
            <ImportPeople />
          </SheetButton>
          <SheetButton label="Quick Add" title="Quick add">
            <ApiForm path="/api/people/quick-add" submitLabel="Add" fields={[{ name: "full_name", label: "Full name", required: true }]} />
          </SheetButton>
          <SheetButton label="New Person" title="New person" className="btn primary">
            <ApiForm
              path="/api/people"
              submitLabel="Add person"
              columns={2}
              fields={[
                { name: "full_name", label: "Full name", required: true },
                { name: "phone", label: "Phone", type: "tel" },
                { name: "email", label: "Email", type: "email" },
                {
                  name: "gender",
                  label: "Gender",
                  type: "select",
                  options: [{ value: "", label: "Not set" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }],
                },
                { name: "address", label: "Address" },
                { name: "source", label: "How they heard of us" },
              ]}
            />
          </SheetButton>
        </div>
      </div>

      <form className="filters" method="get" style={{ marginBottom: 0 }}>
        <input type="search" name="q" defaultValue={sp.q} placeholder="Search name, phone or email" aria-label="Search" style={{ backgroundColor: "var(--fill-2)" }} />
        <AutoSelect name="tag" defaultValue={tagId ?? ""} aria-label="Tag" style={{ backgroundColor: "var(--fill-2)" }}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </AutoSelect>
        <AutoSelect name="status" defaultValue={status} aria-label="Status" style={{ backgroundColor: "var(--fill-2)" }}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </AutoSelect>
      </form>

      {duplicates.length > 0 && (
        <section className="card">
          <details>
            <summary style={{ marginTop: 0 }}>Possible duplicates ({duplicates.length})</summary>
            <p className="muted small" style={{ marginTop: 8 }}>From self-registration. Merging arrives in v1.5. For now, review each pair and dismiss once checked.</p>
            <ul className="list">
              {duplicates.map((d) => (
                <li key={d.id} className="spread">
                  <span>
                    <Link href={`/people/${d.person_id}`}>{d.person_name}</Link> and{" "}
                    <Link href={`/people/${d.matched_id}`}>{d.matched_name}</Link>{" "}
                    <span className="badge warn">same {d.matched_on}</span>
                  </span>
                  <ActionButton path={`/api/people/duplicates/${d.id}/dismiss`}>Dismiss</ActionButton>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="card">
        <DataTable
          rows={rows}
          rowKey={(p) => p.id}
          href={(p) => `/people/${p.id}`}
          empty="No people match this search."
          mobile={(p) => (
            <>
              {p.full_name}
              <span className="sub">{p.phone ?? "No phone"}, first visit {fmtDate(p.first_visit_date)}</span>
              {(p.tags.length > 0 || p.status === "archived") && <span className="row-tags">{tagBadges(p)}</span>}
            </>
          )}
          columns={[
            { label: "Name", render: (p) => <PersonCell name={p.full_name} /> },
            { label: "Phone", nowrap: true, render: (p) => p.phone ?? "—" },
            { label: "Email", desktopOnly: true, render: (p) => p.email ?? "—" },
            { label: "Tags", render: (p) => <span className="row" style={{ gap: 4 }}>{tagBadges(p)}</span> },
            { label: "First visit", nowrap: true, render: (p) => fmtDate(p.first_visit_date) },
          ]}
        />
      </section>

      {total > PAGE && (
        <div className="spread">
          {page > 1 ? <Link className="btn sm" href={link(page - 1)}>Previous</Link> : <span />}
          <span className="small muted">Page {page} of {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total ? <Link className="btn sm" href={link(page + 1)}>Next</Link> : <span />}
        </div>
      )}
    </div>
  );
}
