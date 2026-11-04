"use client";

import { useRouter } from "next/navigation";
import { createContext, FormEvent, ReactNode, useContext, useRef, useState } from "react";
import { Icon } from "./icons";

const SheetContext = createContext<(() => void) | null>(null);
/** Inside a SheetButton, closes the sheet. Elsewhere, returns null. */
export const useSheetClose = () => useContext(SheetContext);

/** A toolbar button that presents its content in a sheet: bottom on phones, centred on wider screens. */
export function SheetButton(props: { label: ReactNode; title: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={props.className ?? "btn"} onClick={() => ref.current?.showModal()}>{props.label}</button>
      <dialog
        ref={ref}
        className="ios-sheet"
        aria-label={props.title}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" className="sheet-close" onClick={close} aria-label="Close">
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        </div>
        <SheetContext.Provider value={close}>
          <div style={{ padding: "0 4px 12px" }}>{props.children}</div>
        </SheetContext.Provider>
      </dialog>
    </>
  );
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.") as Error & { details?: unknown };
    error.details = data.details;
    throw error;
  }
  return data;
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <div className="alert error" role="alert">{message}</div> : null;
}

/** A button that calls the API, refreshes the page's data, and shows any error. */
export function ActionButton(props: {
  path: string;
  method?: string;
  body?: unknown;
  children: ReactNode;
  className?: string;
  /** If set, an iOS alert asks this question first. */
  confirm?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api(props.path, props.method ?? "POST", props.body ?? {});
      dialog.current?.close();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={props.className ?? "btn sm"}
        disabled={busy}
        onClick={() => (props.confirm ? dialog.current?.showModal() : run())}
      >
        {props.children}
      </button>
      {props.confirm && (
        <dialog ref={dialog} className="ios-alert">
          <h2>{props.confirm}</h2>
          <div className="alert-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={run}>{busy ? "…" : "OK"}</button>
          </div>
        </dialog>
      )}
      {error && <span className="small" role="alert" style={{ color: "var(--danger)" }}>{error}</span>}
    </>
  );
}

/** iOS alert for irreversible actions: a destructive button and Cancel. */
export function ConfirmDialogButton(props: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  path: string;
  body?: unknown;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn sm danger" onClick={() => ref.current?.showModal()}>
        {props.label}
      </button>
      <dialog ref={ref} className="ios-alert">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <ErrorNote message={error} />
        <div className="alert-actions stacked">
          <button
            type="button"
            className="btn danger solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(props.path, "POST", props.body ?? {});
                ref.current?.close();
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.confirmLabel}
          </button>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
        </div>
      </dialog>
    </>
  );
}

export type FieldDef =
  | { name: string; label: string; type?: "text" | "email" | "tel" | "date" | "textarea"; required?: boolean; defaultValue?: string; placeholder?: string }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string }
  | { name: string; label: string; type: "checkbox"; defaultChecked?: boolean };

/** A small form that posts its fields as JSON. Empty values are sent as null. */
export function ApiForm(props: {
  path: string;
  method?: string;
  fields: FieldDef[];
  submitLabel: string;
  extra?: Record<string, unknown>;
  resetOnSuccess?: boolean;
  columns?: 1 | 2;
  onDone?: (result: unknown) => void;
}) {
  const router = useRouter();
  const closeSheet = useSheetClose();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = { ...props.extra };
    for (const f of props.fields) {
      if (f.type === "checkbox") body[f.name] = data.get(f.name) === "on";
      else body[f.name] = ((data.get(f.name) as string) ?? "").trim() || null;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api(props.path, props.method ?? "POST", body);
      if (props.resetOnSuccess !== false) form.reset();
      props.onDone?.(result);
      closeSheet?.();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ErrorNote message={error} />
      <div className={`fields ${props.columns === 2 ? "two" : ""}`}>
        {props.fields.map((f) => {
          const id = `f-${f.name}`;
          if (f.type === "checkbox") {
            return (
              <div className="field" key={f.name}>
                <label className="check">
                  <input type="checkbox" role="switch" name={f.name} defaultChecked={f.defaultChecked} /> {f.label}
                </label>
              </div>
            );
          }
          return (
            <div className="field" key={f.name}>
              <label htmlFor={id}>{f.label}</label>
              {f.type === "select" ? (
                <select id={id} name={f.name} required={f.required} defaultValue={f.defaultValue}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea id={id} name={f.name} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} />
              ) : (
                <input id={id} name={f.name} type={f.type ?? "text"} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} />
              )}
            </div>
          );
        })}
      </div>
      <button className="btn primary" disabled={busy}>{busy ? "Saving…" : props.submitLabel}</button>
    </form>
  );
}
