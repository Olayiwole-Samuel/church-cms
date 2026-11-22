import Link from "next/link";
import { HeadcountForm } from "@/components/HeadcountForm";
import { churchCheckinToken } from "@/lib/checkin";
import { today } from "@/lib/config";
import { listPrograms } from "@/lib/queries";

export const metadata = { title: "Take Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [programs, token] = await Promise.all([listPrograms(), churchCheckinToken()]);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Take Attendance</h1></div>
      <HeadcountForm
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        today={today()}
        initialProgram={sp.program}
        initialSession={sp.session}
      />
      {token && (
        <section className="card">
          <h2>Church check-in QR</h2>
          <p className="small muted">
            One code for every service. The first scan on a phone asks for name and phone. After that, scanning marks the person
            present straight away. It works once today&apos;s service has been started.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr-box" src="/api/checkin-qr?format=png" alt="Church check-in QR code" />
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <a className="btn sm" href="/api/checkin-qr?format=png&download=1">Download PNG</a>
            <a className="btn sm" href="/api/checkin-qr?format=svg&download=1">Download SVG</a>
            <Link className="btn sm" href={`/checkin/${token}`} target="_blank">Open check-in page</Link>
          </div>
        </section>
      )}
    </div>
  );
}
