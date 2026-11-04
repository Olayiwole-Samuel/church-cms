"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonPicker, PickedPerson } from "./PersonPicker";
import { ActionButton, api, ErrorNote, useSheetClose } from "./ui";

export function FollowUpCreate() {
  const router = useRouter();
  const closeSheet = useSheetClose();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [reason, setReason] = useState("first_timer");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!person) return <PersonPicker onPick={setPerson} placeholder="Search for a person" />;
  return (
    <div>
      <ErrorNote message={error} />
      <p><strong>{person.full_name}</strong> <button className="btn sm" onClick={() => setPerson(null)}>Change</button></p>
      <div className="fields two">
        <div className="field">
          <label htmlFor="reason">Reason</label>
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="first_timer">First timer</option>
            <option value="drop_off">Dropped off</option>
            <option value="altar_call">Altar call (priority)</option>
            <option value="absence">Absence</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="assigned">Assign to</label>
          <input id="assigned" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </div>
      </div>
      <button
        className="btn primary"
        onClick={async () => {
          setError(null);
          try {
            await api("/api/follow-ups", "POST", { person_id: person.id, reason, assigned_to: assignedTo || null });
            setPerson(null);
            setAssignedTo("");
            closeSheet?.();
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Create follow-up
      </button>
    </div>
  );
}

export function FollowUpRow(props: {
  id: string;
  status: string;
  assignedTo: string | null;
  notes: string | null;
  /** Stays open while the person is away, so the only admin decision is to remove them. */
  stayUntilReturn: boolean;
  personId: string;
  personName: string;
  personArchived: boolean;
}) {
  const router = useRouter();
  const [assignedTo, setAssignedTo] = useState(props.assignedTo ?? "");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = assignedTo !== (props.assignedTo ?? "") || notes !== (props.notes ?? "");

  return (
    <div>
      <ErrorNote message={error} />
      <div className="fields two">
        <div className="field">
          <label htmlFor={`a-${props.id}`}>Assigned to</label>
          <input id={`a-${props.id}`} value={assignedTo} placeholder="Unassigned" onChange={(e) => { setAssignedTo(e.target.value); setSaved(false); }} />
        </div>
        <div className="field">
          <label htmlFor={`n-${props.id}`}>Notes</label>
          <input id={`n-${props.id}`} value={notes} placeholder="Add a note" onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="row">
        {dirty && (
          <button
            className="btn sm"
            onClick={async () => {
              setError(null);
              try {
                await api(`/api/follow-ups/${props.id}`, "PUT", { assigned_to: assignedTo, notes });
                setSaved(true);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save
          </button>
        )}
        {props.stayUntilReturn ? (
          props.status === "open" && (
            <ActionButton
              className="btn sm danger"
              path={`/api/people/${props.personId}`}
              method="PUT"
              body={{ status: "archived" }}
              confirm={`Remove ${props.personName} from the church list? Their history is kept and you can restore them from People.`}
            >
              Remove
            </ActionButton>
          )
        ) : props.status === "open" ? (
          <ActionButton className="btn sm primary" path={`/api/follow-ups/${props.id}`} method="PUT" body={{ status: "done" }}>Mark done</ActionButton>
        ) : (
          <ActionButton path={`/api/follow-ups/${props.id}`} method="PUT" body={{ status: "open" }}>Reopen</ActionButton>
        )}
        {props.personArchived && <span className="badge">Removed</span>}
        {saved && <span className="small muted" role="status">Saved</span>}
      </div>
    </div>
  );
}
