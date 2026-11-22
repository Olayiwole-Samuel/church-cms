"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ErrorNote } from "./ui";

interface Session { id: string; date: string; male: number | null; female: number | null; children: number | null }
type Counts = { male: string; female: string; children: string };

const GROUPS: [keyof Counts, string][] = [["male", "Male"], ["female", "Female"], ["children", "Children"]];
const EMPTY: Counts = { male: "", female: "", children: "" };

/** The church's attendance: pick the service, type three numbers. Saving again corrects them. */
export function HeadcountForm(props: {
  programs: { id: string; name: string }[];
  today: string;
  initialProgram?: string;
  initialSession?: string;
}) {
  const [programId, setProgramId] = useState(props.initialProgram ?? props.programs[0]?.id ?? "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState(props.initialSession ?? "");
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    if (!programId) return;
    const list = (await api<Session[]>(`/api/programs/${programId}/sessions`)).filter((s) => s.date <= props.today);
    setSessions(list);
    setSessionId((current) => (list.some((s) => s.id === current) ? current : (list[0]?.id ?? "")));
  }, [programId, props.today]);

  useEffect(() => { guard(loadSessions); }, [guard, loadSessions]);

  const selected = sessions.find((s) => s.id === sessionId);
  useEffect(() => {
    setCounts(
      selected && selected.male !== null
        ? { male: String(selected.male), female: String(selected.female), children: String(selected.children) }
        : EMPTY,
    );
  }, [selected]);

  const hasToday = sessions.some((s) => s.date === props.today);
  const total = GROUPS.reduce((sum, [key]) => sum + (Number(counts[key]) || 0), 0);

  function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    guard(async () => {
      const saved = await api<{ total: number }>(`/api/sessions/${sessionId}/headcount`, "PUT", {
        male: Number(counts.male),
        female: Number(counts.female),
        children: Number(counts.children),
      });
      await loadSessions();
      setNotice(`Saved. ${saved.total} people at this service.`);
    }).finally(() => setBusy(false));
  }

  if (props.programs.length === 0) return <p className="empty">Create a program first.</p>;

  return (
    <div className="stack">
      <section className="card">
        <div className="fields two">
          <div className="field">
            <label htmlFor="program">Program</label>
            <select id="program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {props.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="session">Service date</label>
            <select id="session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={sessions.length === 0}>
              {sessions.length === 0 && <option>No services yet</option>}
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.date}{s.male === null ? " (not entered)" : ""}</option>)}
            </select>
          </div>
        </div>
        {!hasToday && (
          <button
            className="btn"
            onClick={() =>
              guard(async () => {
                const s = await api<{ id: string }>(`/api/programs/${programId}/sessions`, "POST", { date: props.today });
                await loadSessions();
                setSessionId(s.id);
              })
            }
          >
            Start today&apos;s service ({props.today})
          </button>
        )}
        <p className="small muted" style={{ margin: "0.75rem 0 0" }}>QR check-in, for members and workers, only works once today&apos;s service has been started.</p>
      </section>

      <ErrorNote message={error} />
      {notice && <div className="alert ok" role="status" style={{ marginBottom: 0 }}>{notice}</div>}

      {sessionId && (
        <section className="card">
          <h2>How many people came?</h2>
          <form onSubmit={save}>
            <div className="headcount-fields">
              {GROUPS.map(([key, label]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100000}
                    step={1}
                    required
                    value={counts[key]}
                    onChange={(e) => setCounts({ ...counts, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="spread">
              <span>Total: <strong className="num">{total}</strong></span>
              <button className="btn primary" disabled={busy}>{busy ? "Saving…" : selected?.male === null ? "Save attendance" : "Save changes"}</button>
            </div>
          </form>
          <p className="small muted" style={{ margin: "0.75rem 0 0" }}>
            Count everyone at the service, including workers and people who scanned in. People who come out at altar call are entered by name in <Link href={`/altar-call?session=${sessionId}`}>Altar Call</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
