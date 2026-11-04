import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { currentAdmin } from "@/lib/auth";
import { churchName } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await currentAdmin();
  if (!email) redirect("/login");
  return (
    <div className="shell">
      <AdminNav churchName={churchName()} email={email} />
      <div className="content">
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
