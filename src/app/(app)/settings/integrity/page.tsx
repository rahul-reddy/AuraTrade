import EmptyAccountState from '@/components/layout/EmptyAccountState'
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
    return <EmptyAccountState />
  }

  return <IntegrityClient accountId={account.id} accountName={account.name} />
}
