import { AttendanceTaker } from "@/components/AttendanceTaker";
import { today } from "@/lib/config";
import { listPrograms } from "@/lib/queries";

export const metadata = { title: "Take Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const programs = await listPrograms();
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Take Attendance</h1></div>
      <AttendanceTaker
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        today={today()}
        initialProgram={sp.program}
        initialSession={sp.session}
      />
    </div>
  );
}
