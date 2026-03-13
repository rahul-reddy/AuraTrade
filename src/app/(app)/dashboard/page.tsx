import { getRequiredSession } from "@/lib/session";
import LogoutButton from "@/components/auth/LogoutButton";

export default async function DashboardPage() {
  const session = await getRequiredSession();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-white font-semibold text-lg">AuraTrade</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/upload" className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
            Upload
          </a>
          <span className="text-zinc-400 text-sm">{session.user.email}</span>
          <LogoutButton />
        </div>
      </div>

      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-zinc-400 mt-1">Welcome, {session.user.name ?? session.user.email}</p>
      <p className="text-zinc-600 text-sm mt-4">Full dashboard coming in Phase 10.</p>
    </div>
  );
}
