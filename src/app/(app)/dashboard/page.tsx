import { getRequiredSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getRequiredSession();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-zinc-400 mt-1">Welcome, {session.user.name ?? session.user.email}</p>
      <p className="text-zinc-600 text-sm mt-4">Phase 10 — coming soon.</p>
    </div>
  );
}
