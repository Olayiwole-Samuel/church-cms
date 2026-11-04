import { EXPORT_QUERIES } from "@/lib/queries";

export const metadata = { title: "Export" };

export default function ExportPage() {
  const entities = Object.keys(EXPORT_QUERIES);
  const half = Math.ceil(entities.length / 2);
  const group = (list: string[]) => (
    <section className="card">
      <ul className="list">
        {list.map((entity) => (
          <li key={entity} className="spread">
            <span>{entity.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>
            <span className="row">
              <a className="btn sm" href={`/api/export/${entity}?format=csv`}>CSV</a>
              <a className="btn sm" href={`/api/export/${entity}?format=xlsx`}>Excel</a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Export</h1>
        <a className="btn primary" href="/api/export/all?format=xlsx">Everything (Excel)</a>
      </div>
      <div className="columns-2">
        {group(entities.slice(0, half))}
        {group(entities.slice(half))}
      </div>
    </div>
  );
}
