"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonPicker } from "./PersonPicker";
import { api, ErrorNote } from "./ui";

interface Session { id: string; date: string; present_count: number }
interface Mark { id: string; person_id: string; present: boolean; altar_call: boolean; method: string; full_name: string }
interface Roster { attendance: Mark[]; unmarked: { id: string; full_name: string }[] }

export function AttendanceTaker(props: {
  programs: { id: string; name: string }[];
  today: string;
  initialProgram?: string;
  initialSession?: string;
}) {
  const [programId, setProgramId] = useState(props.initialProgram ?? props.programs[0]?.id ?? "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState(props.initialSession ?? "");
  const [roster, setRoster] = useState<Roster>({ attendance: [], unmarked: [] });
  const [altar, setAltar] = useState(false);
  const [onBehalf, setOnBehalf] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerReset, setPickerReset] = useState(0);
  const [bulk, setBulk] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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

  const loadRoster = useCallback(async () => {
    if (!sessionId) {
      setRoster({ attendance: [], unmarked: [] });
      return;
    }
    setRoster(await api<Roster>(`/api/sessions/${sessionId}`));
  }, [sessionId]);

  useEffect(() => { guard(loadSessions); }, [guard, loadSessions]);
  useEffect(() => { guard(loadRoster); setTicked(new Set()); }, [guard, loadRoster]);

  const mark = (personId: string, name: string) =>
    guard(async () => {
      await api("/api/attendance", "POST", {
        session_id: sessionId,
        person_id: personId,
        present: true,
        altar_call: altar || undefined,
        method: onBehalf ? "on_behalf" : "admin",
      });
      setNotice(`${name} marked present${altar ? " with altar call" : ""}.`);
      setAltar(false);
      await loadRoster();
    });

  const quickAdd = () =>
    guard(async () => {
      const person = await api<{ id: string; full_name: string }>("/api/people/quick-add", "POST", { full_name: query.trim() });
      await mark(person.id, person.full_name);
      setPickerReset((n) => n + 1);
    });

  const hasToday = sessions.some((s) => s.date === props.today);
  const present = roster.attendance.filter((a) => a.present);
  const absent = roster.attendance.filter((a) => !a.present);

  if (props.programs.length === 0) return <p className="empty">Create a program first.</p>;

  return (
    <div className="split wide-side">
      <div className="side">
      <section className="card">
        <div className="fields two">
          <div className="field">
            <label htmlFor="program">Program</label>
            <select id="program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {props.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="session">Session</label>
            <select id="session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={sessions.length === 0}>
              {sessions.length === 0 && <option>No sessions yet</option>}
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.date}</option>)}
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
            Start today&apos;s session ({props.today})
          </button>
        )}
      </section>

      {error && <div style={{ marginBottom: -12 }}><ErrorNote message={error} /></div>}
      {notice && <div className="alert ok" role="status" style={{ marginBottom: 0 }}>{notice}</div>}

      {sessionId && (
          <section className="card">
            <div className="spread" style={{ marginBottom: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>{bulk ? "Mark absent" : "Mark present"}</h2>
              <button className="btn sm" onClick={() => setBulk(!bulk)}>{bulk ? "Back to mark present" : "Bulk mark absent"}</button>
            </div>
            {!bulk ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label className="check"><input type="checkbox" role="switch" checked={altar} onChange={(e) => setAltar(e.target.checked)} /> Altar call</label>
                  <label className="check"><input type="checkbox" role="switch" checked={onBehalf} onChange={(e) => setOnBehalf(e.target.checked)} /> On behalf</label>
                </div>
                <PersonPicker onPick={(p) => mark(p.id, p.full_name)} actionLabel="Present" onQueryChange={setQuery} resetKey={pickerReset} />
                {query.trim().length >= 2 && (
                  <button className="btn sm" style={{ marginTop: "0.5rem" }} onClick={quickAdd}>
                    Quick-add &ldquo;{query.trim()}&rdquo; and mark present
                  </button>
                )}
              </>
            ) : roster.unmarked.length === 0 ? (
              <p className="empty">Everyone who has attended this program before is already marked.</p>
            ) : (
              <>
                <p className="small muted">People who have attended this program before and have no mark on this session.</p>
                <div className="row" style={{ marginBottom: "0.5rem" }}>
                  <button className="btn sm" onClick={() => setTicked(new Set(roster.unmarked.map((u) => u.id)))}>Select all ({roster.unmarked.length})</button>
                  <button className="btn sm" onClick={() => setTicked(new Set())}>Clear</button>
                  <button
                    className="btn sm primary"
                    disabled={ticked.size === 0}
                    onClick={() =>
                      guard(async () => {
                        const r = await api<{ marked: number }>("/api/attendance", "POST", { session_id: sessionId, person_ids: [...ticked], bulk_absent: true });
                        setNotice(`${r.marked} marked absent.`);
                        setTicked(new Set());
                        await loadRoster();
                      })
                    }
                  >
                    Mark {ticked.size} absent
                  </button>
                </div>
                <ul className="list">
                  {roster.unmarked.map((u) => (
                    <li key={u.id}>
                      <label className="check tick">
                        <input
                          type="checkbox"
                          checked={ticked.has(u.id)}
                          onChange={(e) => {
                            const next = new Set(ticked);
                            if (e.target.checked) next.add(u.id);
                            else next.delete(u.id);
                            setTicked(next);
                          }}
                        />
                        {u.full_name}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
      )}
      </div>

      <div className="main-col">
      {sessionId && (
          <section className="card">
            <h2>Present ({present.length})</h2>
            {present.length === 0 ? <p className="empty">Nobody marked yet.</p> : (
              <ul className="list">
                {present.map((a) => (
                  <li key={a.id} className="spread">
                    <span>{a.full_name} {a.method === "qr" && <span className="badge">QR</span>} {a.altar_call && <span className="badge priority">Altar call</span>}</span>
                    <span className="row">
                      <button
                        className="btn sm"
                        onClick={() =>
                          guard(async () => {
                            await api(`/api/attendance/${a.id}/altar-call`, "POST", { altar_call: !a.altar_call });
                            await loadRoster();
                          })
                        }
                      >
                        {a.altar_call ? "Undo altar call" : "Altar call"}
                      </button>
                      <button
                        className="btn sm"
                        onClick={() =>
                          guard(async () => {
                            await api("/api/attendance", "POST", { session_id: sessionId, person_id: a.person_id, present: false });
                            await loadRoster();
                          })
                        }
                      >
                        Mark absent
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {absent.length > 0 && (
              <details>
                <summary>Absent ({absent.length})</summary>
                <ul className="list">
                  {absent.map((a) => (
                    <li key={a.id} className="spread">
                      <span>{a.full_name}</span>
                      <button className="btn sm" onClick={() => mark(a.person_id, a.full_name)}>Mark present</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
      )}
      </div>
    </div>
  );
}
