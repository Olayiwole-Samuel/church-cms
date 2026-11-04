"use client";

import { useEffect, useState } from "react";
import { api } from "./ui";

export interface PickedPerson {
  id: string;
  full_name: string;
  phone?: string | null;
}

/** Search-as-you-type over active people. Calls onPick when a result is tapped. */
export function PersonPicker(props: {
  onPick: (person: PickedPerson) => void;
  placeholder?: string;
  actionLabel?: string;
  onQueryChange?: (q: string) => void;
  resetKey?: number;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedPerson[]>([]);

  useEffect(() => setQ(""), [props.resetKey]);
  useEffect(() => {
    props.onQueryChange?.(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api<{ rows: PickedPerson[] }>(`/api/people?status=active&limit=10&q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.rows))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={props.placeholder ?? "Search by name or phone"}
        aria-label={props.placeholder ?? "Search by name or phone"}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="list" style={{ marginTop: "0.25rem" }}>
          {results.map((p) => (
            <li key={p.id} className="spread">
              <span>
                {p.full_name} {p.phone && <span className="muted small">{p.phone}</span>}
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  props.onPick(p);
                  setQ("");
                }}
              >
                {props.actionLabel ?? "Select"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
