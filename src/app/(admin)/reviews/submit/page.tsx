import { notFound } from "next/navigation";
import { fmtDate } from "@/components/format";
import { ReviewForm } from "@/components/ReviewForm";
import { reviewDetail } from "@/lib/queries";

export const metadata = { title: "Submit Review" };
const UUID = /^[0-9a-f-]{36}$/;

export default async function SubmitReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!UUID.test(sp.department ?? "") || !UUID.test(sp.session ?? "")) notFound();
  const detail = await reviewDetail(sp.department!, sp.session!);
  if (!detail) notFound();
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{detail.department.name} review</h1>
          <p className="muted small" style={{ margin: 0 }}>{fmtDate(detail.session.date)}, {detail.session.program_name}</p>
        </div>
      </div>
      <ReviewForm
        departmentId={detail.department.id}
        sessionId={detail.session.id}
        review={detail.review ? { summary: detail.review.summary, challenges: detail.review.challenges, highlights: detail.review.highlights } : null}
        members={detail.members.map((m) => ({ id: m.id, full_name: m.full_name }))}
        notes={Object.fromEntries(detail.notes.map((n) => [n.person_id, n.note]))}
      />
    </div>
  );
}
