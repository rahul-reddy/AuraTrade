import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import EmptyAccountState from '@/components/layout/EmptyAccountState'
import WeeklyReviewClient from '@/components/journal/WeeklyReviewClient'
import { daySchema } from '@/lib/journal/contracts'
import { todayTradingDay } from '@/lib/journal/review'
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getRequiredSession()
  const params = await searchParams
  const account = await prisma.tradingAccount.findFirst({ where: { userId: session.user.id, ...(typeof params.accountId === 'string' ? { id: params.accountId } : {}) }, orderBy: { createdAt: 'asc' } })
  if (!account) return <EmptyAccountState missing={typeof params.accountId === 'string'} />
  return <WeeklyReviewClient accountId={account.id} initialDay={daySchema.safeParse(params.date).data ?? todayTradingDay()} />
}
