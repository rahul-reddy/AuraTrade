import EmptyAccountState from '@/components/layout/EmptyAccountState'
import { prisma } from '@/lib/prisma'
import { getRequiredSession } from '@/lib/session'
import DashboardClient from '@/components/dashboard/DashboardClient'

type SearchParams = Record<string, string | string[] | undefined>

function getStringParam(params: SearchParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value ? value : undefined
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getRequiredSession()
  const userId = session.user.id
  const params = await searchParams

  const requestedAccountId = getStringParam(params, 'accountId')
  const account = requestedAccountId
    ? await prisma.tradingAccount.findFirst({
        where: { id: requestedAccountId, userId },
      })
    : await prisma.tradingAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      })

  if (!account) {
    return <EmptyAccountState missing={!!requestedAccountId} />
  }

  return (
    <DashboardClient
      accountId={account.id}
      accountName={account.name}
      userEmail={session.user.email}
      userName={session.user.name}
      initialDateFrom={getStringParam(params, 'dateFrom')}
      initialDateTo={getStringParam(params, 'dateTo')}
    />
  )
}
