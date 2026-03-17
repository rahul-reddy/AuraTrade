import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getRequiredSession()
  const userId = session.user.id

  let accountName = 'No account'
  try {
    const account = await prisma.tradingAccount.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    })
    if (account) accountName = account.name
  } catch {
    // DB unavailable — shell still renders; pages handle their own data errors
  }

  const userEmail = session.user.email || session.user.name || 'Unknown user'

  return (
    <AppShell userEmail={userEmail} accountName={accountName}>
      {children}
    </AppShell>
  )
}
