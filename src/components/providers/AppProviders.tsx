'use client'

import { ReactNode, useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useTheme } from './useTheme'
import { AmountPrivacyProvider } from './AmountPrivacy'
import { DraftLinkGuard } from './DraftNavigationGuard'

export default function AppProviders({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <AmountPrivacyProvider><DraftLinkGuard />{children}</AmountPrivacyProvider>
        <Toaster theme={theme} position="bottom-right" richColors />
      </QueryClientProvider>
    </SessionProvider>
  )
}
