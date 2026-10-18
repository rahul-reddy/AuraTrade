'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface TradesErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function TradesError({ error, reset }: TradesErrorProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-foreground flex items-center justify-center px-4">
      <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800">
        <CardContent className="pt-8 pb-7">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-3 rounded-full bg-loss/10">
              <AlertTriangle className="w-7 h-7 text-loss" />
            </div>

            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-zinc-100">
                Trade history failed to load
              </h1>
              <p className="text-sm text-zinc-400">
                Something went wrong while loading this trades view. Try again, or go back to
                your dashboard and reopen it.
              </p>
              {error.digest && (
                <p className="text-xs text-zinc-600 font-mono">Error ID: {error.digest}</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={reset} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Retry
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-foreground"
              >
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
