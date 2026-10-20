export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SCHWAB_AUTO_SYNC_ENABLED === '1') {
    const { runDailySync } = await import('@/lib/brokers/schwab/service')
    // The persistent hosted Node server runs this hourly, catching missed days
    // after restart. Database locks serialize workers; no public cron endpoint.
    const run = () => { void runDailySync().catch(() => {}) }
    setTimeout(run, 60000).unref()
    setInterval(run, 3600000).unref()
  }
}
