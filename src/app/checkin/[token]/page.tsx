"use client";

import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ErrorNote } from "@/components/ui";

interface State {
  program: { name: string };
  session: { date: string } | null;
  person: { first_name: string } | null;
  already_checked_in: boolean;
}

export default function ProgramCheckin() {
  const { token } = useParams<{ token: string }>();
  const url = `/api/checkin/${token}`;
  const [state, setState] = useState<State | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<State>(url).then(setState).catch((e) => setFatal(e.message));
  }, [url]);
  useEffect(load, [load]);

  async function submit(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ first_name: string }>(url, "POST", body);
      setDone(result.first_name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({ full_name: data.get("full_name"), phone: data.get("phone"), email: data.get("email") || null });
  }

  async function notMe() {
    await api(url, "DELETE");
    setState((s) => (s ? { ...s, person: null, already_checked_in: false } : s));
  }

  return (
    <div className="center-page">
      <div className="card center-card">
        <BrandLogo size="lg" />
        {fatal ? (
          <p role="alert">{fatal}</p>
        ) : !state ? (
          <p className="muted">Loading…</p>
        ) : done || state.already_checked_in ? (
          <div style={{ textAlign: "center" }}>
            <div className="confirm-mark" aria-hidden>✓</div>
            <h1>{done ? `Thank you, ${done}` : `Welcome back, ${state.person?.first_name}`}</h1>
            <p className="muted">You are checked in for {state.program.name}.</p>
          </div>
        ) : !state.session ? (
          <>
            <h1>{state.program.name}</h1>
            <p className="muted">There is no service open for check-in today. Please try again on the day of the service.</p>
          </>
        ) : state.person ? (
          <div style={{ textAlign: "center" }}>
            <h1>Welcome back, {state.person.first_name}</h1>
            <p className="muted">{state.program.name}</p>
            <ErrorNote message={error} />
            <button className="btn primary big block" disabled={busy} onClick={() => submit({})}>
              {busy ? "Checking in…" : "Check in"}
            </button>
            <button className="btn sm" style={{ marginTop: "0.75rem" }} onClick={notMe}>
              Not {state.person.first_name}?
            </button>
          </div>
        ) : (
          <form onSubmit={register}>
            <h1>{state.program.name}</h1>
            <p className="muted">Welcome. Please tell us who you are. You only need to do this once on this phone.</p>
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
            <button className="btn primary big block" disabled={busy}>{busy ? "Checking in…" : "Check in"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
