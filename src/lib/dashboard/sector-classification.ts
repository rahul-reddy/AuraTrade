import YahooFinance from 'yahoo-finance2'

interface QuoteSummaryAssetProfile {
  sector?: string
  industry?: string
}

interface QuoteSummaryResult {
  assetProfile?: QuoteSummaryAssetProfile
}

export interface SectorInfo {
  sector: string | null
  industry: string | null
}

const yahoo = new YahooFinance() as unknown as {
  quoteSummary(symbol: string, opts: { modules: ['assetProfile'] }): Promise<QuoteSummaryResult>
}

const sectorCache = new Map<string, { data: SectorInfo; fetchedAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function getSectorInfo(symbol: string): Promise<SectorInfo> {
  const normalized = symbol.trim().toUpperCase()
  const cached = sectorCache.get(normalized)

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const summary = await yahoo.quoteSummary(normalized, { modules: ['assetProfile'] })
    const data = {
      sector: summary.assetProfile?.sector ?? null,
      industry: summary.assetProfile?.industry ?? null,
    }
    sectorCache.set(normalized, { data, fetchedAt: Date.now() })
    return data
  } catch {
    return { sector: null, industry: null }
  }
}
