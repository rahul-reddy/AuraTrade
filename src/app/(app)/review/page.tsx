import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import EmptyAccountState from '@/components/layout/EmptyAccountState'
import DailyReviewClient from '@/components/journal/DailyReviewClient'
import { daySchema } from '@/lib/journal/contracts'
import { todayTradingDay } from '@/lib/journal/review'

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getRequiredSession()
  const params = await searchParams
  const account = await prisma.tradingAccount.findFirst({ where: { userId: session.user.id, ...(typeof params.accountId === 'string' ? { id: params.accountId } : {}) }, orderBy: { createdAt: 'asc' } })
  if (!account) return <EmptyAccountState missing={typeof params.accountId === 'string'} />
  const parsed = daySchema.safeParse(params.date)
  return <DailyReviewClient key={`${account.id}:${parsed.data ?? 'today'}`} accountId={account.id} accountName={account.name} date={parsed.success ? parsed.data : todayTradingDay()} />
}
