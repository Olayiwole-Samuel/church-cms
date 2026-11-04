"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, ErrorNote } from "./ui";

export function ReviewForm(props: {
  departmentId: string;
  sessionId: string;
  review: { summary: string | null; challenges: string | null; highlights: string | null } | null;
  members: { id: string; full_name: string }[];
  notes: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/api/reviews", "POST", {
        department_id: props.departmentId,
        session_id: props.sessionId,
        summary: data.get("summary"),
        challenges: data.get("challenges"),
        highlights: data.get("highlights"),
        notes: props.members.map((m) => ({ person_id: m.id, note: String(data.get(`note-${m.id}`) ?? "") })),
      });
      router.push("/reviews");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="columns-2">
        <section className="card">
          <h2>Service</h2>
          <div className="field">
            <label htmlFor="summary">Summary</label>
            <textarea id="summary" name="summary" required defaultValue={props.review?.summary ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="challenges">Challenges</label>
            <textarea id="challenges" name="challenges" defaultValue={props.review?.challenges ?? ""} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="highlights">Highlights</label>
            <textarea id="highlights" name="highlights" defaultValue={props.review?.highlights ?? ""} />
          </div>
        </section>
        <section className="card">
          <h2>Member notes</h2>
          <p className="small muted">A note is required for every member.</p>
          {props.members.length === 0 && <p className="empty">This department had no members at this service.</p>}
          {props.members.map((m) => (
            <div className="field" key={m.id}>
              <label htmlFor={`note-${m.id}`}>{m.full_name}</label>
              <textarea id={`note-${m.id}`} name={`note-${m.id}`} required defaultValue={props.notes[m.id] ?? ""} style={{ minHeight: 60 }} />
            </div>
          ))}
        </section>
      </div>
      <ErrorNote message={error} />
      <div><button className="btn primary" disabled={busy}>{busy ? "Submitting…" : "Submit review"}</button></div>
    </form>
  );
}
