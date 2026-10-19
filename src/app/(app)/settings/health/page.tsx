import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import EmptyAccountState from '@/components/layout/EmptyAccountState'
import HealthClient from '@/components/settings/HealthClient'
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getRequiredSession()
  const params = await searchParams
  const account = await prisma.tradingAccount.findFirst({ where: { userId: session.user.id, ...(typeof params.accountId === 'string' ? { id: params.accountId } : {}) }, orderBy: { createdAt: 'asc' } })
  if (!account) return <EmptyAccountState missing={typeof params.accountId === 'string'} />
  return <HealthClient accountId={account.id} />
}
