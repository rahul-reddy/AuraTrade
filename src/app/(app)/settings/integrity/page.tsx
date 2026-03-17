import Link from 'next/link'
import IntegrityClient from '@/components/settings/IntegrityClient'
import { getRequiredSession } from '@/lib/session'
import { resolveIntegrityAccount } from '@/lib/settings/integrity'

type SearchParams = Record<string, string | string[] | undefined>

function getStringParam(params: SearchParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value ? value : undefined
}

export default async function IntegrityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getRequiredSession()
  const params = await searchParams
  const account = await resolveIntegrityAccount(session.user.id, getStringParam(params, 'accountId'))

  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-3">No trading account found.</p>
          <Link href="/upload" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Upload a CSV to get started →
          </Link>
        </div>
      </div>
    )
  }

  return <IntegrityClient accountId={account.id} accountName={account.name} />
}
