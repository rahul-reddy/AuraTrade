import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getRequiredSession()
  const userId = session.user.id

  const account = await prisma.tradingAccount.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { name: true },
  })

  return (
    <AppShell
      userEmail={session.user.email}
      accountName={account?.name ?? 'No account'}
    >
      {children}
    </AppShell>
  )
}
