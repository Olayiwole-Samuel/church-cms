"use client";

import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ErrorNote } from "@/components/ui";

interface State {
  department: { id: string; name: string };
  departments: { id: string; name: string }[];
  sessions: { id: string; program_name: string; checked_in: boolean }[];
  person: { first_name: string } | null;
  locked_department: { id: string; name: string } | null;
  barred: boolean;
}

interface Done {
  first_name: string;
  department: string;
  program: string;
  waiting_corner: boolean;
}

export default function DepartmentCheckin() {
  const { token } = useParams<{ token: string }>();
  const url = `/api/checkin/dept/${token}`;
  const [state, setState] = useState<State | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");

  const load = useCallback(() => {
    api<State>(url)
      .then((s) => {
        setState(s);
        setSessionId(s.sessions.find((x) => !x.checked_in)?.id ?? s.sessions[0]?.id ?? "");
      })
      .catch((e) => setFatal(e.message));
  }, [url]);
  useEffect(load, [load]);

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setDone(await api<Done>(url, "POST", { ...body, session_id: sessionId || undefined }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function firstTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({
      department_id: data.get("department_id"),
      full_name: data.get("full_name") ?? undefined,
      phone: data.get("phone") ?? undefined,
      email: data.get("email") || undefined,
    });
  }

  async function notMe() {
    await api(`/api/checkin/${token}`, "DELETE");
    setState(null);
    load();
  }

  const serviceChoice =
    state && state.sessions.length > 1 ? (
      <div className="field" style={{ textAlign: "left" }}>
        <label htmlFor="session">Which service are you serving at?</label>
        <select id="session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          {state.sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.program_name}{s.checked_in ? " (checked in)" : ""}</option>
          ))}
        </select>
      </div>
    ) : null;

  const alreadyChecked = state?.sessions.find((s) => s.id === sessionId)?.checked_in;

  return (
    <div className="center-page">
      <div className="card center-card">
        <BrandLogo size="lg" />
        {fatal ? (
          <p role="alert">{fatal}</p>
        ) : !state ? (
          <p className="muted">Loading…</p>
        ) : done ? (
          <div style={{ textAlign: "center" }}>
            <div className="confirm-mark" aria-hidden>✓</div>
            <h1>Thank you, {done.first_name}</h1>
            <p className="muted">Recorded for {done.department} at {done.program}.</p>
            {done.waiting_corner && (
              <div className="alert info">Please speak with the church admin about your department status.</div>
            )}
          </div>
        ) : state.barred ? (
          <>
            <h1>Please see the church admin</h1>
            <p className="muted">They can help with your department.</p>
          </>
        ) : state.sessions.length === 0 ? (
          <>
            <h1>{state.department.name}</h1>
            <p className="muted">There is no service open for check-in today. Please try again on the day of the service.</p>
          </>
        ) : state.person && state.locked_department ? (
          <div style={{ textAlign: "center" }}>
            <h1>Welcome back, {state.person.first_name}</h1>
            <p className="muted">Serving in {state.locked_department.name}</p>
            {state.locked_department.id !== state.department.id && (
              <div className="alert info">
                This code is for {state.department.name}, but you are in {state.locked_department.name}. Only the church admin can change your department.
              </div>
            )}
            {serviceChoice}
            <ErrorNote message={error} />
            {alreadyChecked ? (
              <p><span className="badge good">Already checked in for this service</span></p>
            ) : (
              <button className="btn primary big block" disabled={busy} onClick={() => submit({})}>
                {busy ? "Checking in…" : "Check in"}
              </button>
            )}
            <button className="btn sm" style={{ marginTop: "0.75rem" }} onClick={notMe}>Not {state.person.first_name}?</button>
          </div>
        ) : (
          <form onSubmit={firstTime}>
            <h1>Department check-in</h1>
            <p className="muted">Choose carefully. Your department is locked after this, and only the church admin can change it.</p>
            <ErrorNote message={error} />
            {!state.person && (
              <>
                <div className="field">
                  <label htmlFor="full_name">Full name</label>
                  <input id="full_name" name="full_name" autoComplete="name" required />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" name="phone" type="tel" autoComplete="tel" required />
                </div>
                <div className="field">
                  <label htmlFor="email">Email (optional)</label>
                  <input id="email" name="email" type="email" autoComplete="email" />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="department_id">Your department</label>
              <select id="department_id" name="department_id" defaultValue={state.department.id} required>
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            {serviceChoice}
            <button className="btn primary big block" disabled={busy}>{busy ? "Checking in…" : "Check in"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
