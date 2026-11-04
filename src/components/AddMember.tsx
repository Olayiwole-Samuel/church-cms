"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonPicker } from "./PersonPicker";
import { api, ErrorNote } from "./ui";

export function AddMember({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ErrorNote message={error} />
      <PersonPicker
        actionLabel="Add"
        placeholder="Search for a person to add"
        onPick={async (p) => {
          setError(null);
          try {
            await api(`/api/departments/${departmentId}/members`, "POST", { person_id: p.id });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    </>
  );
}
