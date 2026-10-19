import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import EmptyAccountState from '@/components/layout/EmptyAccountState'
import InsightsClient from '@/components/journal/InsightsClient'

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getRequiredSession()
  const params = await searchParams
  const account = await prisma.tradingAccount.findFirst({ where: { userId: session.user.id, ...(typeof params.accountId === 'string' ? { id: params.accountId } : {}) }, orderBy: { createdAt: 'asc' } })
  if (!account) return <EmptyAccountState missing={typeof params.accountId === 'string'} />
  return <InsightsClient accountId={account.id} accountName={account.name} />
}
