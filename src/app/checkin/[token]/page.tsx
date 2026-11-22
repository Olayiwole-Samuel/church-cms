"use client";

import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ErrorNote } from "@/components/ui";

interface State {
  church: string;
  sessions: { id: string; program_name: string; checked_in: boolean }[];
  auto_session_id: string | null;
  person: { first_name: string } | null;
}

/**
 * The church's check-in QR. The first scan on a phone asks who you are. After that,
 * scanning marks you present straight away, with nothing to type or tap.
 */
export default function MemberCheckin() {
  const { token } = useParams<{ token: string }>();
  const url = `/api/checkin/${token}`;
  const [state, setState] = useState<State | null>(null);
  const [done, setDone] = useState<{ first_name: string; program: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const autoTried = useRef(false);

  const load = useCallback(() => {
    api<State>(url)
      .then((s) => {
        setState(s);
        setSessionId(s.auto_session_id ?? s.sessions.find((x) => !x.checked_in)?.id ?? s.sessions[0]?.id ?? "");
      })
      .catch((e) => setFatal(e.message));
  }, [url]);
  useEffect(load, [load]);

  const submit = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        setDone(await api<{ first_name: string; program: string }>(url, "POST", body));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [url],
  );

  // A returning phone with one obvious service is checked in as soon as the page opens.
  const auto = state?.person && state.auto_session_id ? state.sessions.find((s) => s.id === state.auto_session_id) : undefined;
  useEffect(() => {
    if (auto && !auto.checked_in && !autoTried.current) {
      autoTried.current = true;
      submit({ session_id: auto.id });
    }
  }, [auto, submit]);

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({ session_id: sessionId || null, full_name: data.get("full_name"), phone: data.get("phone"), email: data.get("email") || null });
  }

  async function notMe() {
    await api(url, "DELETE");
    autoTried.current = true;
    setDone(null);
    setError(null);
    setState((s) => (s ? { ...s, person: null, sessions: s.sessions.map((x) => ({ ...x, checked_in: false })) } : s));
  }

  const notMeButton = state?.person && (
    <button className="btn sm" style={{ marginTop: "0.75rem" }} onClick={notMe}>Not {state.person.first_name}?</button>
  );
  const serviceChoice =
    state && state.sessions.length > 1 ? (
      <div className="field" style={{ textAlign: "left" }}>
        <label htmlFor="session">Which service are you attending?</label>
        <select id="session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          {state.sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.program_name}{s.checked_in ? " (checked in)" : ""}</option>
          ))}
        </select>
      </div>
    ) : null;

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
            <p className="muted">You are marked present at {done.program}.</p>
            {notMeButton}
          </div>
        ) : state.sessions.length === 0 ? (
          <>
            <h1>{state.church}</h1>
            <p className="muted">There is no service open for check-in yet. Please try again once the service has started.</p>
          </>
        ) : state.person && auto?.checked_in ? (
          <div style={{ textAlign: "center" }}>
            <div className="confirm-mark" aria-hidden>✓</div>
            <h1>Welcome back, {state.person.first_name}</h1>
            <p className="muted">You are already checked in for {auto.program_name}.</p>
            {notMeButton}
          </div>
        ) : state.person && auto ? (
          <div style={{ textAlign: "center" }}>
            <h1>Welcome back, {state.person.first_name}</h1>
            {error ? (
              <>
                <ErrorNote message={error} />
                <button className="btn primary big block" disabled={busy} onClick={() => submit({ session_id: auto.id })}>Try again</button>
              </>
            ) : (
              <p className="muted">Checking you in…</p>
            )}
            {notMeButton}
          </div>
        ) : state.person ? (
          <div style={{ textAlign: "center" }}>
            <h1>Welcome back, {state.person.first_name}</h1>
            {serviceChoice}
            <ErrorNote message={error} />
            {state.sessions.find((s) => s.id === sessionId)?.checked_in ? (
              <p><span className="badge good">Already checked in for this service</span></p>
            ) : (
              <button className="btn primary big block" disabled={busy} onClick={() => submit({ session_id: sessionId })}>
                {busy ? "Checking in…" : "Check in"}
              </button>
            )}
            {notMeButton}
          </div>
        ) : (
          <form onSubmit={register}>
            <h1>Welcome to {state.church}</h1>
            <p className="muted">Please tell us who you are. You only do this once on this phone. Next time, scanning marks you present straight away.</p>
            <ErrorNote message={error} />
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
            {serviceChoice}
            <button className="btn primary big block" disabled={busy}>{busy ? "Checking in…" : "Check in"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
