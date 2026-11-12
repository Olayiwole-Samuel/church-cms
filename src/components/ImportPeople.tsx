"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";
import { buildRows, guessMapping, IMPORT_FIELDS, ImportField, MAX_IMPORT_ROWS, parseCsv } from "@/lib/csv-import";
import type { ImportResult } from "@/lib/people-import";
import { api, ErrorNote, useSheetClose } from "./ui";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Choose a CSV, check the columns, review what will happen, then confirm. Nothing is saved before Import. */
export function ImportPeople() {
  const router = useRouter();
  const closeSheet = useSheetClose();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFileName(null);
    setTable(null);
    setMapping([]);
    setCheck(null);
    setDone(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) return setError("Choose a .csv file. In Excel or Google Sheets, use Save As or Download, then CSV.");
    if (file.size > MAX_FILE_BYTES) return setError("That file is over 5 MB. Split it into smaller files.");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError("The file needs a heading row and at least one person.");
    if (rows.length - 1 > MAX_IMPORT_ROWS) return setError(`The file has ${rows.length - 1} people. Import at most ${MAX_IMPORT_ROWS} at a time.`);
    const guessed = guessMapping(rows[0]);
    setTable(rows);
    setMapping(guessed);
    if (!guessed.includes("full_name") && !guessed.includes("first_name")) {
      setError("No column looks like a name. Pick which column holds names below.");
    }
  }

  async function send(dryRun: boolean) {
    if (!table) return;
    setBusy(true);
    setError(null);
    try {
      const rows = buildRows(table, mapping);
      const result = await api<ImportResult>("/api/people/import", "POST", { rows, dryRun });
      if (dryRun) setCheck(result);
      else {
        setDone(result);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasName = mapping.includes("full_name") || mapping.includes("first_name");
  const preview = table ? buildRows(table.slice(0, 4), mapping) : [];

  if (done) {
    return (
      <div>
        <div className="confirm-mark" aria-hidden>✓</div>
        <h3 style={{ textAlign: "center" }}>{done.added} {done.added === 1 ? "person" : "people"} added</h3>
        <Summary result={done} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => { reset(); closeSheet?.(); }}>Done</button>
          <button className="btn" onClick={reset}>Import another file</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Save your list from Excel or Google Sheets as a CSV file. The first row should hold the column headings.{" "}
        <a href="/api/people/import-template">Download a sample file</a>.
      </p>

      <div>
        <input ref={input} id="csv-file" type="file" accept=".csv,text/csv" onChange={choose} hidden />
        <label htmlFor="csv-file" className="btn" style={{ margin: 0, color: "var(--accent-ink)" }}>
          {fileName ? "Choose a different file" : "Choose CSV file"}
        </label>
        {fileName && <span className="small muted" style={{ marginLeft: 10, overflowWrap: "anywhere" }}>{fileName}</span>}
      </div>

      <ErrorNote message={error} />

      {table && (
        <>
          <div>
            <h3 style={{ marginBottom: 2 }}>{table.length - 1} {table.length - 1 === 1 ? "person" : "people"} found</h3>
            <p className="small muted" style={{ margin: "0 0 8px" }}>Check what each column is. Columns set to Don&apos;t import are left out.</p>
            <ul className="list" style={{ margin: 0 }}>
              {table[0].map((header, i) => (
                <li key={i} className="spread" style={{ gap: 12 }}>
                  <span style={{ minWidth: 0 }}>
                    {header || <span className="muted">Column {i + 1}</span>}
                    <span className="sub" style={{ overflowWrap: "anywhere" }}>e.g. {table[1]?.[i] || "(empty)"}</span>
                  </span>
                  <select
                    aria-label={`What is the ${header || `column ${i + 1}`} column?`}
                    value={mapping[i] ?? ""}
                    style={{ width: "auto", minWidth: 150, flex: "none" }}
                    onChange={(e) => {
                      const next = [...mapping];
                      const value = (e.target.value || null) as ImportField | null;
                      next.forEach((f, j) => { if (value && f === value) next[j] = null; });
                      next[i] = value;
                      setMapping(next);
                      setCheck(null);
                      setError(null);
                    }}
                  >
                    <option value="">Don&apos;t import</option>
                    {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>

          {hasName && preview.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Preview</h3>
              <ul className="list" style={{ margin: 0 }}>
                {preview.map((p) => (
                  <li key={p.row}>
                    {p.full_name || <span className="muted">(no name)</span>}
                    <span className="sub">
                      {[p.phone, p.email, p.gender, p.department, p.tags?.join(", ")].filter(Boolean).join(" · ") || "No other details"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!check ? (
            <button className="btn primary" disabled={busy || !hasName} onClick={() => send(true)}>
              {busy ? "Checking…" : "Check file"}
            </button>
          ) : (
            <div>
              <h3 style={{ marginBottom: 6 }}>Ready to import</h3>
              <Summary result={check} />
              <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || check.added === 0} onClick={() => send(false)}>
                {busy ? "Importing…" : check.added === 0 ? "Nobody new to add" : `Import ${check.added} ${check.added === 1 ? "person" : "people"}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ result }: { result: ImportResult }) {
  const lines: [string, number][] = [
    [result.dryRun ? "Will be added" : "Added", result.added],
    ["Already here, skipped", result.skipped.filter((s) => s.reason === "Already in the system").length],
    ["Repeated in the file, skipped", result.skipped.filter((s) => s.reason.startsWith("Same person as row")).length],
    ["No name, skipped", result.skipped.filter((s) => s.reason === "No name" || s.reason === "Name is too long").length],
    ["Put in a department", result.addedToDepartments],
    ["Flagged as possible duplicates", result.flaggedAsPossibleDuplicates],
  ];
  return (
    <>
      <ul className="list" style={{ margin: 0 }}>
        {lines.filter(([label, n]) => n > 0 || label.startsWith("Will") || label === "Added").map(([label, n]) => (
          <li key={label} className="spread"><span>{label}</span><strong className="num">{n}</strong></li>
        ))}
      </ul>
      {result.flaggedAsPossibleDuplicates > 0 && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>Possible duplicates share a phone or a name with someone already here. Review them under Possible duplicates on this page.</p>
      )}
      {(result.warnings.length > 0 || result.skipped.length > 0) && (
        <details>
          <summary>Details by row ({result.warnings.length + result.skipped.length})</summary>
          <ul className="list small" style={{ margin: 0 }}>
            {result.skipped.slice(0, 200).map((s) => (
              <li key={`s${s.row}`}>Row {s.row}{s.name ? `, ${s.name}` : ""}: skipped. {s.reason}.</li>
            ))}
            {result.warnings.slice(0, 200).map((w, i) => (
              <li key={`w${w.row}-${i}`}>Row {w.row}: {w.message}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
